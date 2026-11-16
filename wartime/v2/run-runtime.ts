import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { readFile, rmdir, unlink, lstat, realpath } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { BotSDK } from "../../sdk/index";
import { BotActions } from "../../sdk/actions";
import {
  withExecutionDeadline,
  executionContext,
} from "../../sdk/execution-context";
import { startInjected } from "./host";
import { Memory } from "../memory.mjs";
import { strictStatus } from "./ownership.mjs";
import { RunError, processStamp, fail } from "./run-store.mjs";
const worker = fileURLToPath(new URL("./run-client.ts", import.meta.url));
function aborted(signal: AbortSignal) {
  if (signal.aborted) throw signal.reason ?? new RunError("RUN_CANCELLED");
}
export async function probeWorld(config: any, signal: AbortSignal) {
  aborted(signal);
  let r;
  try {
    r = await fetch(new URL("/api/version", config.world), {
      redirect: "error",
      signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
    });
  } catch {
    aborted(signal);
    fail("WORLD_HTTP_TRANSPORT");
  }
  if (!r.ok)
    fail(
      r.status === 401 || r.status === 403
        ? "NETWORK_ACCESS_DENIED"
        : r.status === 429
          ? "RATE_LIMIT"
          : "SERVER_UNAVAILABLE",
    );
  let v;
  try {
    v = await r.json();
  } catch {
    fail("WORLD_VERSION_UNKNOWN");
  }
  if (v.revision !== 289) fail("OUTDATED_CLIENT");
  await new Promise<void>((resolve, reject) => {
    aborted(signal);
    const ws = new WebSocket(config.gateway);
    let done = false;
    const finish = (error?: any) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      ws.close();
      error ? reject(error) : resolve();
    };
    const abort = () => finish(signal.reason ?? new RunError("RUN_CANCELLED"));
    const timer = setTimeout(
      () => finish(new RunError("GATEWAY_WEBSOCKET_TRANSPORT")),
      5000,
    );
    signal.addEventListener("abort", abort, { once: true });
    ws.onopen = () => finish();
    ws.onerror = () => finish(new RunError("GATEWAY_WEBSOCKET_TRANSPORT"));
  });
}
export async function runStatus(
  config: any,
  character: string,
  signal: AbortSignal,
) {
  aborted(signal);
  return strictStatus(
    new URL("/status/" + encodeURIComponent(character), config.world).href,
  );
}
export async function launchClient(store: any, { signal, requireFresh }: any) {
  aborted(signal);
  let cwd;
  try {
    cwd = await realpath(
      fileURLToPath(new URL("../../server/webclient/", import.meta.url)),
    );
  } catch {
    fail("CLIENT_UNAVAILABLE");
  }
  const child = spawn(process.execPath, [worker], {
    cwd,
    env: {
      ...process.env,
      WARTIME_RUN_RECORD: store.file,
      WARTIME_ACCOUNT_GENERATION: String(store.record.activeGeneration),
      WARTIME_REQUIRE_FRESH: String(requireFresh),
    },
    stdio: ["pipe", "pipe", "ignore"],
  });
  let ended = false,
    intentional = false,
    settled = false,
    evidence: any = {};
  let readyResolve: any, readyReject: any, lostResolve: any;
  const ready = new Promise((r, j) => {
      readyResolve = r;
      readyReject = j;
    }),
    lost = new Promise<string>((r) => (lostResolve = r));
  ready.catch(() => {});
  const exited = new Promise<void>((r) =>
    child.once("close", () => {
      ended = true;
      if (!settled) {
        settled = true;
        readyReject(
          new RunError(
            evidence.clientLoggedIn
              ? "CLIENT_DISCONNECTED"
              : "CLIENT_UNAVAILABLE",
            evidence,
          ),
        );
      }
      if (!intentional) lostResolve("CLIENT_DISCONNECTED");
      r();
    }),
  );
  child.stdin?.on("error", () => {});
  const lines = createInterface({ input: child.stdout! });
  let bytes = 0;
  lines.on("line", (line) => {
    bytes += line.length;
    if (bytes > 100000) {
      void close();
      return;
    }
    try {
      const m = JSON.parse(line);
      if (m.type === "logged_in") evidence.clientLoggedIn = true;
      if (m.type === "fresh_state_confirmed")
        evidence.freshStateConfirmed = true;
      if (m.type === "ready") {
        Object.assign(evidence, m.evidence);
        if (!settled) {
          settled = true;
          readyResolve({ ...evidence });
        }
      }
      if (m.type === "failure") {
        Object.assign(evidence, m.evidence);
        const code = /^[A-Z_]+$/.test(m.code)
          ? m.code
          : "CLIENT_PROTOCOL_FAILED";
        if (!settled) {
          settled = true;
          readyReject(new RunError(code, evidence));
        } else lostResolve(code);
      }
    } catch {
      if (!settled) {
        settled = true;
        readyReject(new RunError("CLIENT_PROTOCOL_FAILED", evidence));
      }
      void close();
    }
  });
  child.once("error", () => {
    if (!settled) {
      settled = true;
      readyReject(new RunError("CLIENT_UNAVAILABLE"));
    }
  });
  let closing: any;
  async function close() {
    if (closing) return closing;
    intentional = true;
    closing = (async () => {
      if (!ended) {
        child.stdin!.end("stop\n");
        const timer = setTimeout(() => {
          if (!ended) child.kill("SIGKILL");
        }, 2000);
        await exited;
        clearTimeout(timer);
      }
      lines.close();
      signal.removeEventListener("abort", abort);
    })();
    return closing;
  }
  const abort = () => {
    if (!settled) {
      settled = true;
      readyReject(
        new RunError(
          signal.reason?.code ?? "CLIENT_READINESS_TIMEOUT",
          evidence,
        ),
      );
    }
    void close();
  };
  signal.addEventListener("abort", abort, { once: true });
  store.account.child = {
    pid: child.pid,
    start: child.pid ? await processStamp(child.pid) : null,
    worker,
  };
  await store.save();
  if (signal.aborted) abort();
  return { ready, lost, close };
}
export async function recoverRun(store: any, signal: AbortSignal) {
  aborted(signal);
  const child = store.account.child;
  if (
    child?.pid &&
    child.start &&
    (await processStamp(child.pid)) === child.start
  ) {
    const command = await readFile(`/proc/${child.pid}/cmdline`, "utf8");
    if (!command.split("\0").includes(worker))
      fail("OWNED_CHILD_IDENTITY_UNKNOWN");
    process.kill(child.pid, "SIGTERM");
    const deadline = Date.now() + 3000;
    while ((await processStamp(child.pid)) === child.start) {
      if (Date.now() > deadline) fail("OWNED_CHILD_DID_NOT_STOP");
      await new Promise((r) => setTimeout(r, 30));
      aborted(signal);
    }
  }
  const a = store.account;
  const status = await runStatus(store.config, a.character, signal);
  if (
    status.state !== "ZERO" ||
    status.inGame ||
    status.clientStatus !== "dead"
  )
    fail(
      status.state === "UNKNOWN"
        ? "NETWORK_STATUS_UNKNOWN"
        : "OWNERSHIP_OCCUPIED",
    );
  const memory = new Memory({
    world: store.record.world,
    player: a.character,
    directory: path.join(store.dir, "accounts", String(a.generation), "memory"),
  });
  for (const name of ["host.lock", "startup.lock", "controller.lock"])
    try {
      await rmdir(path.join(memory.directory, name));
    } catch (e: any) {
      if (e.code !== "ENOENT") fail("OWNED_LOCK_RECOVERY_FAILED");
    }
  const socket = path.join(store.dir, "host.sock");
  try {
    if (!(await lstat(socket)).isSocket()) fail("RUN_SOCKET_NOT_OWNED_TYPE");
    await unlink(socket);
  } catch (e: any) {
    if (e.code !== "ENOENT") throw e;
  }
}
export async function connectOwner(store: any, { signal, onStop }: any) {
  aborted(signal);
  const a = store.account;
  const sdk = new BotSDK({
    botUsername: a.character,
    password: a.password,
    gatewayUrl: store.record.gateway,
    autoReconnect: false,
    autoLaunchBrowser: false,
    connectionMode: "control",
    connectTimeout: Math.min(store.config.startupTimeoutMs, 10000),
    readyTimeout: 10000,
  });
  let host: any,
    closed = false,
    preempted = false,
    lostResolve: any;
  const lost = new Promise<string>((r) => (lostResolve = r));
  const abort = () => {
    void sdk.disconnect();
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    await sdk.connect();
    aborted(signal);
    if (
      !sdk.isAuthenticated() ||
      !sdk.getState()?.inGame ||
      sdk.getStateAge() > 3000
    )
      fail("OWNER_READY_TIMEOUT");
    const evidence: any = { controllerAuthenticated: true };
    const state = sdk.getState();
    if (state.player.name.toLowerCase() !== a.character.toLowerCase())
      fail("CLIENT_CHARACTER_MISMATCH");
    const tutorial =
      state.modalInterface === 3559 ||
      state.nearbyNpcs.some((n: any) => /runescape guide/i.test(n.name));
    if (store.config.onboarding === "skip_tutorial" && tutorial) {
      const result = await executionContext.run({ signal }, () =>
        withExecutionDeadline(
          Math.min(30000, store.config.startupTimeoutMs),
          () => new BotActions(sdk).skipTutorial({ randomizeAppearance: true }),
          () => {
            throw new RunError("ONBOARDING_TIMEOUT");
          },
        ),
      );
      aborted(signal);
      if (!result.success) fail("ONBOARDING_UNVERIFIED");
      await executionContext.run({ signal }, () =>
        sdk.waitForCondition(
          (s: any) => s.inGame && !s.modalOpen && s.player.worldX >= 3200,
          5000,
        ),
      );
      evidence.onboardingComplete = true;
    } else {
      evidence.tutorialPending = tutorial;
      evidence.onboardingComplete = !tutorial;
    }
    aborted(signal);
    const config = {
      ...store.config,
      character: a.character,
      directory: path.join(
        store.dir,
        "accounts",
        String(a.generation),
        "memory",
      ),
      socket: path.join(store.dir, "host.sock"),
      onStop,
    };
    host = await startInjected({ sdk, config });
    aborted(signal);
    evidence.controllerReady = true;
    sdk.onConnectionStateChange((s: any) => {
      if (s !== "connected" && !closed)
        lostResolve(preempted ? "OWNERSHIP_LOST" : "SDK_RECONNECT_AMBIGUOUS");
    });
    (sdk as any).ws?.addEventListener("message", (event: any) => {
      try {
        const m = JSON.parse(String(event.data));
        if (
          m.type === "sdk_error" &&
          String(m.error).includes("another controller connected")
        )
          preempted = true;
      } catch {}
    });
    signal.removeEventListener("abort", abort);
    return {
      evidence,
      lost,
      host,
      async close() {
        if (closed) return;
        closed = true;
        try {
          await host.close();
        } finally {
          await sdk.disconnect();
        }
      },
    };
  } catch (e: any) {
    closed = true;
    try {
      if (host) await host.close();
    } finally {
      await sdk.disconnect();
      signal.removeEventListener("abort", abort);
    }
    if (signal.aborted) throw signal.reason;
    if (e instanceof RunError) throw e;
    if (/auth|password|unauthorized/i.test(String(e.message)))
      fail("AUTH_BLOCKED");
    fail("SDK_RECONNECT_AMBIGUOUS");
  }
}
export const runtime = {
  probe: probeWorld,
  status: runStatus,
  launchClient,
  connectOwner,
  recover: recoverRun,
};
