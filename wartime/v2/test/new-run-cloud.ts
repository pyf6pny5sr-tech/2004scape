// Real isolated cloud engine/client/SDK entry-point probe; names/passwords stay private.
// Fault injection affects only an old character's local gateway registration.
import { spawn } from "node:child_process";
import { mkdir, writeFile, readFile, stat } from "node:fs/promises";
import { tool } from "../client.mjs";
const root = new URL("../../.wartime/new-run-validation/", import.meta.url)
  .pathname;
await mkdir(root, { recursive: true, mode: 0o700 });
let blockedName: string | null = null,
  blockedRegistrations = 0;
const proxy = Bun.serve<{ upstream: WebSocket; pending: string[] }>({
  hostname: "127.0.0.1",
  port: 7782,
  fetch(req, server) {
    if (req.headers.get("upgrade")?.toLowerCase() === "websocket") {
      if (server.upgrade(req, { data: { upstream: null as any, pending: [] } }))
        return;
      return new Response("", { status: 400 });
    }
    return new Response("local controlled fault proxy");
  },
  websocket: {
    open(ws) {
      const upstream = new WebSocket("ws://localhost:7780/");
      ws.data.upstream = upstream;
      upstream.onopen = () => {
        for (const x of ws.data.pending) upstream.send(x);
        ws.data.pending = [];
      };
      upstream.onmessage = (e) => ws.send(String(e.data));
      upstream.onclose = () => ws.close();
      upstream.onerror = () => ws.close();
    },
    message(ws, data) {
      const raw = String(data);
      let message: any;
      try {
        message = JSON.parse(raw);
      } catch {}
      if (message?.type === "connected" && message.username === blockedName) {
        blockedRegistrations++;
        return;
      }
      if (ws.data.upstream.readyState === WebSocket.OPEN)
        ws.data.upstream.send(raw);
      else ws.data.pending.push(raw);
    },
    close(ws) {
      ws.data.upstream?.close();
    },
  },
});
const config = {
  world: "http://localhost:8888",
  gateway: "ws://localhost:7782/",
  runtimeRoot: root + "runs",
  startupTimeoutMs: 45000,
  reconnectTimeoutMs: 2500,
  reconnectAttempts: 2,
  maxAutomaticReplacements: 1,
  onboarding: "skip_tutorial",
};
const file = root + "config.json";
await writeFile(file, JSON.stringify(config), { mode: 0o600 });
const children: any[] = [];
async function launch(mode = "new", id?: string) {
  const child = spawn(
    process.execPath,
    [new URL("../run.ts", import.meta.url).pathname, mode, ...(id ? [id] : [])],
    {
      env: {
        ...process.env,
        GATEWAY_DIRECT: "false",
        WARTIME_RUN_CONFIG: file,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  children.push(child);
  let stdout = "",
    stderr = "";
  const messages: any[] = [];
  child.stdout.on("data", (b) => {
    stdout += b;
    for (const line of String(b).trim().split("\n"))
      try {
        messages.push(JSON.parse(line));
      } catch {}
  });
  child.stderr.on("data", (b) => (stderr += b));
  const exited = new Promise((r) => child.once("exit", r));
  const deadline = Date.now() + 65000;
  while (Date.now() < deadline) {
    const ready = messages.find((m) => m.status === "CONTROLLER_READY");
    if (ready) {
      const record = JSON.parse(
        await readFile(
          config.runtimeRoot + "/" + ready.runId + "/run.json",
          "utf8",
        ),
      );
      for (const a of record.accounts)
        if (stdout.includes(a.password) || stderr.includes(a.password))
          throw new Error("CREDENTIAL_LEAK");
      return {
        child,
        ready,
        record,
        exited,
        async stop() {
          child.kill("SIGINT");
          await exited;
          const stopped = JSON.parse(
            await readFile(
              config.runtimeRoot + "/" + ready.runId + "/run.json",
              "utf8",
            ),
          );
          if (stopped.status !== "STOPPED" && stopped.status !== "CANCELLED")
            throw new Error("RUN_NOT_STOPPED");
        },
      };
    }
    if (child.exitCode !== null)
      throw new Error(
        "RUN_ENTRY_FAILED " +
          JSON.stringify(messages) +
          " " +
          stderr.slice(0, 1000),
      );
    await Bun.sleep(30);
  }
  child.kill("SIGTERM");
  await exited;
  throw new Error(
    "ENTRY_DEADLINE " + JSON.stringify(messages) + " " + stderr.slice(0, 1000),
  );
}
async function action(run: any) {
  const call = (operation: string, args: any = {}) =>
    tool(run.ready.socket, { operation, ...args }) as Promise<any>;
  const s = await call("status");
  if (
    s.identity.character !== run.ready.character ||
    s.identity.gateway !== config.gateway
  )
    throw new Error("IDENTITY_MISMATCH");
  const token = await call("goal", {
    goal: {
      description:
        "Verify one normal action in a freshly provisioned isolated-cloud run",
    },
  });
  const p = s.observation.player;
  const accepted = await call("submit", {
    proposal: {
      id: "new-run-walk",
      token,
      expiresAt: Date.now() + 60000,
      steps: [
        {
          action: "walk",
          x: p.worldX + 1,
          z: p.worldZ,
          level: p.level,
          expect: [
            { type: "position", x: p.worldX + 1, z: p.worldZ, level: p.level },
          ],
        },
      ],
    },
  });
  const end = Date.now() + 20000;
  while (Date.now() < end) {
    const a = await call("status");
    if (a.phase === "PAUSED" || a.phase === "BLOCKED")
      throw new Error("ACTION_FAILED " + a.reason);
    if (a.lastEpisodeRoutineId === accepted.id)
      return { verified: true, metrics: a.metrics };
    await Bun.sleep(30);
  }
  throw new Error("ACTION_DEADLINE");
}
try {
  const first = await launch();
  const firstAction = await action(first);
  const firstName = first.ready.character,
    firstId = first.ready.runId;
  const original = first.record.accounts[0];
  if (
    !original.evidence.freshStateConfirmed ||
    !original.evidence.clientLoggedIn ||
    !original.evidence.controllerReady ||
    !original.evidence.onboardingComplete
  )
    throw new Error("FRESH_ACCOUNT_UNVERIFIED");
  await first.stop();
  blockedName = firstName;
  const recovered = await launch("resume", firstId);
  const recoveredAction = await action(recovered);
  if (
    recovered.record.replacementsUsed !== 1 ||
    recovered.ready.character === firstName ||
    recovered.record.accounts[0].password !== original.password ||
    recovered.record.accounts[0].reconnectAttemptsUsed !== 2 ||
    blockedRegistrations !== 2
  )
    throw new Error("REPLACEMENT_NOT_VERIFIED");
  await recovered.stop();
  blockedName = null;
  const second = await launch();
  const secondAction = await action(second);
  if (
    second.ready.character === firstName ||
    second.ready.character === recovered.ready.character ||
    second.ready.runId === firstId
  )
    throw new Error("NEW_RUN_REUSED_IDENTITY");
  await second.stop();
  const report = {
    scope:
      "Actual new/resume run.ts CLI, actual pinned lite client/session, local engine, explicit local fault-proxy gateway",
    freshRuns: 2,
    automaticReplacements: 1,
    independentIdentities: 3,
    normalFreshRun: {
      privateConfigCreated: true,
      clientLoggedIn: true,
      freshStateConfirmed: true,
      clientAttached: true,
      onboardingComplete: true,
      controllerReady: true,
      actionVerified: firstAction.verified,
    },
    resumeFault: {
      label:
        "Controlled account-specific gateway-registration drop, not model delay or production behavior",
      blockedRegistrations,
      reconnectAttempts: recovered.record.accounts[0].reconnectAttemptsUsed,
      replacementsUsed: recovered.record.replacementsUsed,
      oldCredentialsPreserved: true,
      newIdentityDifferent: true,
      actionVerified: recoveredAction.verified,
    },
    secondNewRun: {
      newIdentityDifferent: true,
      freshStateConfirmed:
        second.record.accounts[0].evidence.freshStateConfirmed,
      actionVerified: secondAction.verified,
    },
    credentialsInStdoutOrArgs: false,
    privateFileMode:
      (await stat(config.runtimeRoot + "/" + firstId + "/run.json")).mode &
      0o777,
    cleanStops: true,
    metrics: {
      first: firstAction.metrics,
      replacement: recoveredAction.metrics,
      second: secondAction.metrics,
    },
  };
  await writeFile(root + "evidence.json", JSON.stringify(report, null, 2), {
    mode: 0o600,
  });
  console.log(JSON.stringify(report));
} finally {
  for (const c of children) if (c.exitCode === null) c.kill("SIGTERM");
  proxy.stop(true);
}
