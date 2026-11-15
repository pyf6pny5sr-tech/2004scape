// Opt-in REAL LOCAL gameplay probe. Not evidence of online or frontier-model execution.
import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir, chmod, unlink } from "node:fs/promises";
import { tool } from "../client.mjs";
const root = new URL("../../.wartime/v2-cloud/", import.meta.url).pathname;
await mkdir(root, { recursive: true, mode: 0o700 });
const envPath = process.env.WARTIME_LOCAL_BOT_ENV;
if (!envPath) throw new Error("LOCAL_DISPOSABLE_ENV_REQUIRED");
const env = Object.fromEntries(
  (await readFile(envPath, "utf8"))
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
if (env.SERVER !== "localhost:8888") throw new Error("LOCAL_ONLY_PROBE");
const socket = root + "host.sock";
const config = {
  world: "http://localhost:8888",
  gateway: "ws://localhost:7780/",
  character: env.BOT_USERNAME,
  directory: root + "memory",
  socket,
  initialVersion: "steady-1",
  stagedVersions: ["cautious-2"],
  safety: { eatAtHp: 4 },
  church: {
    operatorVerifiedWorldRules: true,
    x: 3243,
    z: 3209,
    level: 0,
    radius: 0,
    anchorId: 409,
    anchorRadius: 6,
    minHp: 8,
    playerClearance: 5,
  },
  handoff: {
    previousOwnerStopped: true,
    acceptNonAtomicGatewayRisk: true,
    world: "http://localhost:8888",
    character: env.BOT_USERNAME,
  },
};
await writeFile(root + "config.json", JSON.stringify(config), { mode: 0o600 });
await chmod(root + "config.json", 0o600);
const child = spawn(
  process.execPath,
  [new URL("../host.ts", import.meta.url).pathname],
  {
    env: {
      ...process.env,
      GATEWAY_DIRECT: "false",
      WARTIME_V2_CONFIG: root + "config.json",
      WARTIME_GAME_PASSWORD: env.PASSWORD,
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let logs = "";
child.stdout.on("data", (b) => (logs += b));
child.stderr.on("data", (b) => (logs += b));
const call = (operation: string, args: any = {}) =>
  tool(socket, { operation, ...args }) as Promise<any>;
async function until(fn: () => Promise<any>, timeout = 60000) {
  const start = performance.now();
  for (;;) {
    if (child.exitCode !== null)
      throw new Error(
        "HOST_EXITED: " + logs.replaceAll(env.PASSWORD, "[REDACTED]"),
      );
    try {
      const r = await fn();
      if (r) return r;
    } catch (e) {
      if (!String(e).includes("ENOENT") && !String(e).includes("ECONNREFUSED"))
        throw e;
    }
    if (performance.now() - start > timeout)
      throw new Error(
        "PROBE_TIMEOUT " + logs.replaceAll(env.PASSWORD, "[REDACTED]"),
      );
    await Bun.sleep(30);
  }
}
const step = (x: number, z: number) => ({
  action: "walk",
  x,
  z,
  level: 0,
  expect: [{ type: "position", x, z, level: 0 }],
  cooldownTicks: 1,
});
try {
  await until(() => call("status"));
  let start = await call("status");
  let goal = await call("goal", {
    goal: {
      description:
        "Local probe: useful round trips, cited retrieval and church policy update",
    },
  });
  if (
    start.observation.player.worldX !== 3222 ||
    start.observation.player.worldZ !== 3222
  ) {
    await call("submit", {
      proposal: {
        id: "reposition",
        token: goal,
        expiresAt: Date.now() + 60000,
        steps: [{ ...step(3222, 3222), timeoutMs: 30000 }],
      },
    });
    start = await until(async () => {
      const s = await call("status");
      if (s.phase === "PAUSED" || s.phase === "BLOCKED")
        throw new Error("REPOSITION_FAILED " + s.reason);
      return !s.active && s.metrics.counts.verifiedActions >= 1 ? s : null;
    });
    goal = await call("goal", {
      goal: {
        description:
          "Local probe: useful round trips, cited retrieval and church policy update",
      },
    });
  }
  const baseline = start.metrics.counts.verifiedActions ?? 0;
  const p = start.observation.player;
  const accepted = await call("submit", {
    proposal: {
      id: "cloud-roundtrip",
      token: goal,
      expiresAt: Date.now() + 120000,
      steps: [step(p.worldX + 1, p.worldZ), step(p.worldX, p.worldZ)],
      repeat: 4,
    },
  });
  const request = await call("planner_request", {
    context: {
      label:
        "External model reply deliberately left pending for LOCAL scheduling probe; no model runtime configured",
    },
  });
  const search = await call("search", { query: "Cook's Assistant" });
  if (!search[0]?.evidence_refs?.length) throw new Error("CITATIONS_MISSING");
  const done = await until(async () => {
    const s = await call("status");
    if (s.phase === "PAUSED" || s.phase === "BLOCKED")
      throw new Error("ROUTINE_FAILED " + JSON.stringify(s.events.slice(-5)));
    return s.metrics.counts.verifiedActions >= baseline + 8 &&
      s.lastEpisodeRoutineId === accepted.id
      ? s
      : null;
  });
  await call("planner_complete", { id: request.id });
  await call("remember", {
    name: "v2_cloud_roundtrip",
    episodeId: done.lastEpisode,
    description: "Verified local roundtrip; no claim about other worlds.",
  });
  const replayAccepted = await call("replay", { name: "v2_cloud_roundtrip" });
  const replay = await until(async () => {
    const s = await call("status");
    return s.metrics.counts.verifiedActions >= baseline + 16 &&
      s.lastEpisodeRoutineId === replayAccepted.id &&
      !s.active
      ? s
      : null;
  });
  await call("maintenance", { version: "cautious-2" });
  const maintenance = await until(async () => {
    const s = await call("status");
    if (s.maintenance?.stage === "POSTPONED")
      throw new Error("MAINTENANCE_POSTPONED " + JSON.stringify(s.maintenance));
    return s.metrics.counts.maintenanceCompleted === 1 ? s : null;
  });
  if (
    maintenance.version !== "cautious-2" ||
    maintenance.token.owner !== start.token.owner
  )
    throw new Error("HANDOFF_OWNER_OR_VERSION_FAILED");
  if (maintenance.goal.description !== replay.goal.description)
    throw new Error("SAVED_GOAL_NOT_RESUMED");
  const resumeToken = maintenance.token;
  const church = maintenance.observation.player;
  await call("submit", {
    proposal: {
      id: "after-update",
      token: resumeToken,
      expiresAt: Date.now() + 60000,
      steps: [
        step(church.worldX + 1, church.worldZ),
        step(church.worldX, church.worldZ),
      ],
    },
  });
  const final = await until(async () => {
    const s = await call("status");
    if (s.phase === "PAUSED" || s.phase === "BLOCKED")
      throw new Error("RESUME_FAILED " + s.reason);
    return s.metrics.counts.verifiedActions >=
      maintenance.metrics.counts.verifiedActions + 2 && !s.active
      ? s
      : null;
  });
  const events = final.events;
  const pendingDispatches = events.filter(
    (e: any) => e.type === "dispatch" && e.plannerPending,
  );
  const evidence = {
    scope:
      "actual local engine/gateway/lite client and standalone host, no online player or frontier model",
    world: config.world,
    sdkCommit: "3aa493c3d26680df5bae2b475cc1805e3db05ae3",
    start: { x: p.worldX, z: p.worldZ },
    end: {
      x: final.observation.player.worldX,
      z: final.observation.player.worldZ,
    },
    retrieval: { id: search[0].id, evidence_refs: search[0].evidence_refs },
    routineReplay: "verified",
    maintenance: {
      from: "steady-1",
      to: final.version,
      ownerUnchanged: final.token.owner === start.token.owner,
      churchAnchors: final.observation.nearbyLocs
        ?.filter((l: any) => l.id === 409)
        .map((l: any) => ({ id: l.id, x: l.x, z: l.z, level: l.level })),
      checkpointed: events.some((e: any) => e.type === "checkpointed"),
      resumed: events.some((e: any) => e.type === "maintenance_resumed"),
    },
    planner: {
      realModel: false,
      label:
        "Local externally-pending bridge request; no artificial model sleep and no real model call",
      dispatchesWhilePending: pendingDispatches.length,
    },
    metrics: final.metrics,
    events,
  };
  await writeFile(
    root + "gameplay-evidence.json",
    JSON.stringify(evidence, null, 2),
    { mode: 0o600 },
  );
  console.log(JSON.stringify(evidence));
} finally {
  if (child.exitCode === null) {
    const exited = new Promise((r) => child.once("exit", r));
    child.kill("SIGINT");
    await exited;
  }
}
