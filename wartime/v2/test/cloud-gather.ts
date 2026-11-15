// Focused actual standalone transport/gathering probe. LOCAL DISPOSABLE ONLY.
import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { tool } from "../client.mjs";
const env = Object.fromEntries(
  (await readFile(process.env.WARTIME_LOCAL_BOT_ENV!, "utf8"))
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
if (env.SERVER !== "localhost:8888") throw new Error("LOCAL_ONLY");
const root = new URL("../../.wartime/v2-gather/", import.meta.url).pathname;
await mkdir(root, { recursive: true, mode: 0o700 });
const config = {
  world: "http://localhost:8888",
  gateway: "ws://localhost:7780/",
  character: env.BOT_USERNAME,
  socket: root + "host.sock",
  directory: root + "memory",
  handoff: {
    previousOwnerStopped: true,
    acceptNonAtomicGatewayRisk: true,
    world: "http://localhost:8888",
    character: env.BOT_USERNAME,
  },
};
await writeFile(root + "config.json", JSON.stringify(config), { mode: 0o600 });
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
  tool(config.socket, { operation, ...args }) as Promise<any>;
async function until(fn: () => Promise<any>) {
  const start = performance.now();
  for (;;) {
    if (child.exitCode !== null) throw new Error("HOST_EXITED");
    try {
      const r = await fn();
      if (r) return r;
    } catch (e) {
      if (!String(e).includes("ENOENT")) throw e;
    }
    if (performance.now() - start > 65000) throw new Error("GATHER_TIMEOUT");
    await Bun.sleep(30);
  }
}
try {
  let initial = await until(() => call("status"));
  let token = await call("goal", {
    goal: {
      description: "Walk out of church to the observed local gathering targets",
    },
  });
  const approach = await call("submit", {
    proposal: {
      id: "approach-observed-tree",
      token,
      expiresAt: Date.now() + 60000,
      steps: [
        {
          action: "walk",
          x: 3253,
          z: 3197,
          level: 0,
          tolerance: 1,
          timeoutMs: 30000,
          expect: [
            { type: "position", x: 3253, z: 3197, level: 0, tolerance: 1 },
          ],
        },
      ],
    },
  });
  initial = await until(async () => {
    const s = await call("status");
    if (s.phase === "PAUSED" || s.phase === "BLOCKED")
      throw new Error("APPROACH_FAILED " + s.reason);
    return s.lastEpisodeRoutineId === approach.id ? s : null;
  });
  token = await call("goal", {
    goal: {
      description:
        "Focused local repeated gathering, verifying real Logs and XP",
    },
  });
  const chop = (name) => ({
    action: "chop",
    target: { name },
    timeoutMs: 30000,
    expect: [
      { type: "inventory_gain", item: { id: 1511 }, amount: 1 },
      { type: "xp_gain", skill: "Woodcutting", amount: 1 },
    ],
  });
  const accepted = await call("submit", {
    proposal: {
      id: "gather-two",
      token,
      expiresAt: Date.now() + 120000,
      steps: [chop("Dead tree"), chop("Tree")],
      repeat: 1,
    },
  });
  const final = await until(async () => {
    const s = await call("status");
    if (s.phase === "PAUSED" || s.phase === "BLOCKED")
      throw new Error("GATHER_FAILED " + s.reason);
    return s.lastEpisodeRoutineId === accepted.id ? s : null;
  });
  const logsCount = (s: any) =>
    s.observation.inventory
      .filter((i: any) => i.id === 1511)
      .reduce((n: number, i: any) => n + i.count, 0);
  const xp = (s: any) =>
    s.observation.skills.find((x: any) => x.name === "Woodcutting").experience;
  const evidence = {
    scope:
      "Real local regular-tree gathering through actual standalone host and Unix HTTP bridge",
    passed: true,
    logsGain: logsCount(final) - logsCount(initial),
    xpGain: xp(final) - xp(initial),
    metrics: final.metrics,
    transport: {
      type: "HTTP over private Unix socket, not MCP stdio",
      entrypoint: "host.ts standalone child process",
      sdkConsoleLines: logs.split("\n").filter(Boolean).length,
      jsonResponsesParsed: true,
      stdoutIsNotTheToolTransport: true,
    },
    limits:
      "The two observed local trees deplete per log; continuous-tree non-resend is separately covered by deterministic observed-gain/animation tests. Pending helper ticks alone are not proof of productive work.",
  };
  if (evidence.logsGain < 2 || evidence.xpGain <= 0)
    throw new Error("NO_REAL_GATHER_EFFECT");
  await writeFile(root + "evidence.json", JSON.stringify(evidence, null, 2), {
    mode: 0o600,
  });
  console.log(JSON.stringify(evidence));
} finally {
  if (child.exitCode === null) {
    const exited = new Promise((r) => child.once("exit", r));
    child.kill("SIGINT");
    await exited;
  }
}
