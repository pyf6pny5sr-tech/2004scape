// Persistent owner. Never run inside execute_code. Short bridge calls update it.
import { ContinuityEvidence } from "./continuity-capture.mjs";
import { LiveMeasure } from "./long-run.mjs";
import { runtimeIdentity } from "./identity.mjs";
import { createServer } from "node:http";
import { readFile, chmod, stat, mkdir, rmdir } from "node:fs/promises";
import { dirname } from "node:path";
import { BotSDK } from "../../sdk/index";
import { Memory } from "../memory.mjs";
import { SDKAdapter } from "./adapter";
import { Executor } from "./executor.mjs";
import { strictStatus, authorizeStartup } from "./ownership.mjs";
import { identity, classify } from "./protocol.mjs";
import { retrieve } from "./knowledge.mjs";
import { policy as steady } from "./versions/steady.mjs";
import { policy as cautious } from "./versions/cautious.mjs";
export const policies = new Map([steady, cautious].map((p) => [p.id, p]));
export async function startInjected({ sdk, config }: any) {
  if (
    !sdk.isConnected() ||
    sdk.config.autoReconnect !== false ||
    sdk.getConnectionMode() !== "control"
  )
    throw new Error("ATTACHED_CONTROL_OWNER_WITH_AUTORECONNECT_OFF_REQUIRED");
  const executor = new Executor({
    adapter: new SDKAdapter(sdk),
    config,
    policies,
  });
  try {
    await executor.start();
    return await createBridge(executor, config);
  } catch (e) {
    if (executor.leaseHeld) await executor.stop();
    throw e;
  }
}
export async function createBridge(executor: any, config: any) {
  const implementation = await runtimeIdentity();
  const measurement = config.measurementFile ? new LiveMeasure(executor, config.measurementFile) : null;
  const measurementOff = measurement ? executor.adapter.subscribe((s: any) => { const start=performance.now(); measurement.observe(s); const ms=performance.now()-start; const o=measurement.overhead??={callbacks:0,totalMs:0,maxMs:0}; o.callbacks++; o.totalMs+=ms; o.maxMs=Math.max(o.maxMs,ms); }) : null;
  const identity = () => ({
    implementation,
    runId: config.runId ?? null,
    character: executor.identity.character,
    world: executor.identity.world,
    gateway: executor.identity.gateway,
    controllerVersion: executor.policy.id,
    owner: executor.owner,
    planner: {
      mode: "current_agent",
      providerRequired: false,
      turnaroundMeaning:
        "Agent and tool request/response turnaround; not isolated model inference time",
      canWakeInactiveChat: false,
    },
  });
  // Optional private evidence augments capture only; baseline tick classification is unchanged.
  const evidence = measurement ? new ContinuityEvidence(executor, config.measurementFile + ".evidence.jsonl", identity) : null;
  if (measurement && evidence) {
    const originalEvent = executor.event.bind(executor);
    executor.event = (type: any, details: any = {}) => { originalEvent(type, details); evidence.event(executor.events.at(-1)); };
    const begin = measurement.begin.bind(measurement), end = measurement.end.bind(measurement);
    measurement.begin = async (durationMs: any) => {
      // Create evidence before the timed window; begin() then captures the exact start.
      await evidence.prepare();
      const result = await begin(durationMs);
      evidence.begin(result.started);
      return result;
    };
    measurement.end = async () => {
      // end() sets its boundary synchronously before awaiting writes; snapshot now,
      // before another game callback can interleave, then drain both private streams.
      const result = end();
      await evidence.end(measurement.ended);
      return await result;
    };
  }
  if (!config.socket || !config.socket.startsWith("/"))
    throw new Error("ABSOLUTE_PRIVATE_SOCKET_REQUIRED");
  await mkdir(dirname(config.socket), { recursive: true, mode: 0o700 });
  // Refuse stale/live socket replacement. Operator must reconcile a prior crash.
  try {
    await stat(config.socket);
    throw new Error("SOCKET_ALREADY_EXISTS");
  } catch (e: any) {
    if (e.code !== "ENOENT") throw e;
  }
  let requests = 0;
  const server = createServer(async (req, res) => {
    const reply = (code: number, body: any) => {
      res.writeHead(code, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (req.method !== "POST" || req.url !== "/tool") {
      reply(404, { error: "NOT_FOUND" });
      return;
    }
    if (requests >= 8) {
      reply(429, { error: "BRIDGE_BUSY" });
      return;
    }
    requests++;
    try {
      let body = "";
      for await (const b of req) {
        body += b;
        if (body.length > 65536) throw new Error("REQUEST_TOO_LARGE");
      }
      const { operation, ...a } = JSON.parse(body);
      let result;
      switch (operation) {
        case "measurement_begin":
          if (!measurement) throw Error("MEASUREMENT_NOT_CONFIGURED");
          result = await measurement.begin(a.durationMs); break;
        case "measurement_claim":
          if (!measurement) throw Error("MEASUREMENT_NOT_CONFIGURED");
          result = measurement.claim(a.id); evidence?.mark("claim", { id:a.id }); break;
        case "measurement_end":
          if (!measurement) throw Error("MEASUREMENT_NOT_CONFIGURED");
          result = await measurement.end(); break;
        case "measurement_status":
          result = measurement?.summary(); break;
        case "identity":
          result = identity();
          break;
        case "agent_context":
          result = {
            runtime: identity(),
            status: executor.status(),
            pendingPlannerRequests: executor.plannerRequests(),
          };
          break;
        case "status":
          result = { ...executor.status(), runtime: identity() };
          break;
        case "goal":
          result = executor.setGoal(a.goal);
          break;
        case "submit":
          result = executor.submit(a.proposal);
          break;
        case "planner_request":
          result = executor.requestPlan(a.context);
          break;
        case "planner_requests":
          result = executor.plannerRequests();
          break;
        case "planner_complete":
          evidence?.mark("completion_submission", { id:a.id });
          measurement?.complete(a.id);
          result = executor.completePlan(
            a.id,
            a.proposal,
            "current_agent_tools",
          );
          break;
        case "search":
        case "record":
          result = await retrieve({ operation, ...a });
          break;
        case "skills":
          result = await executor.memory.listSkills();
          break;
        case "remember":
          result = await executor.remember(a.name, a.episodeId, a.description);
          break;
        case "replay":
          result = await executor.replay(a.name);
          break;
        case "maintenance":
          result = executor.requestMaintenance(a.version);
          break;
        case "cancel_maintenance":
          result = executor.cancelMaintenance();
          break;
        case "resume":
          result = executor.resume();
          break;
        case "stop":
          await executor.stop();
          result = { stopped: true };
          if (config.onStop)
            setImmediate(() => {
              void config.onStop();
            });
          break;
        // Staging is operator-only via trusted local config at process startup.
        default:
          throw new Error("UNKNOWN_OPERATION");
      }
      reply(200, { result });
    } catch (e: any) {
      reply(400, {
        error: classify(e),
        reason: /^[A-Z0-9_]+$/.test(e.message) ? e.message : "REQUEST_FAILED",
      });
    } finally {
      requests--;
    }
  });
  server.requestTimeout = 10000;
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.socket, () => resolve());
  });
  await chmod(config.socket, 0o600);
  for (const v of config.stagedVersions ?? []) executor.stage(v);
  return {
    executor,
    server,
    async close() {
      measurementOff?.();
      if (measurement?.running) await measurement.end();
      await executor.stop();
      await new Promise<void>((r) => server.close(() => r()));
    },
  };
}
export async function startStandalone(config: any) {
  const id = identity(config);
  Object.assign(config, id);
  // Preserve the configured gateway. Do not auto-probe alternative direct ports.
  if (process.env.GATEWAY_DIRECT !== "false")
    throw new Error("SET_GATEWAY_DIRECT_FALSE_TO_PRESERVE_ENDPOINT");
  const reservation = new Memory({
    world: config.world,
    player: config.character,
    directory: config.directory,
  });
  await reservation.initialize();
  const lock = reservation.directory + "/startup.lock";
  try {
    await mkdir(lock, { mode: 0o700 });
  } catch {
    throw new Error("LOCAL_STARTUP_OWNERSHIP_LOCKED");
  }
  let sdk: any;
  try {
    const statusUrl = new URL(
      "/status/" + encodeURIComponent(config.character),
      config.world,
    ).href;
    const status = await strictStatus(statusUrl);
    authorizeStartup(config, status);
    const password = process.env.WARTIME_GAME_PASSWORD;
    if (!password) throw new Error("PRIVATE_GAME_PASSWORD_REQUIRED");
    sdk = new BotSDK({
      botUsername: config.character,
      password,
      gatewayUrl: config.gateway,
      autoReconnect: false,
      autoLaunchBrowser: false,
      connectionMode: "control",
    });
    await sdk.connect();
    if (!sdk.isAuthenticated()) throw new Error("AUTHENTICATION_UNVERIFIED");
    const host = await startInjected({ sdk, config });
    let closed = false;
    return {
      ...host,
      async close() {
        if (closed) return;
        closed = true;
        try {
          await host.close();
        } finally {
          await sdk.disconnect();
          await rmdir(lock);
        }
      },
    };
  } catch (e) {
    if (sdk) await sdk.disconnect();
    await rmdir(lock);
    throw e;
  }
}
if (import.meta.main) {
  try {
    const path = process.env.WARTIME_V2_CONFIG;
    if (!path) throw new Error("PRIVATE_CONFIG_PATH_REQUIRED");
    const info = await stat(path);
    if ((info.mode & 0o077) !== 0)
      throw new Error("CONFIG_MUST_BE_PRIVATE_0600");
    const config = JSON.parse(await readFile(path, "utf8"));
    const host = await startStandalone(config);
    console.log(
      JSON.stringify({
        status: "READY",
        socket: config.socket,
        world: config.world,
      }),
    );
    let closing = false;
    const stop = async () => {
      if (closing) return;
      closing = true;
      await host.close();
      process.exit(0);
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  } catch (e: any) {
    console.error(
      JSON.stringify({
        error: classify(e),
        reason: /^[A-Z0-9_]+$/.test(e.message) ? e.message : "STARTUP_FAILED",
      }),
    );
    process.exitCode = 1;
  }
}
