// One bounded explicitly authorized fresh live smoke. No retry/replacement batch.
import { spawn } from "node:child_process";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { tool } from "../client.mjs";
const root = new URL("../../.wartime/new-run-live/", import.meta.url).pathname;
await mkdir(root, { recursive: true, mode: 0o700 });
const config = {
  world: "https://rs-sdk.maxbittker.com",
  gateway: "wss://rs-sdk.maxbittker.com/gateway",
  runtimeRoot: root + "runs",
  startupTimeoutMs: 45000,
  reconnectAttempts: 1,
  maxAutomaticReplacements: 0,
};
await writeFile(root + "config.json", JSON.stringify(config), { mode: 0o600 });
const child = spawn(
  process.execPath,
  [new URL("../run.ts", import.meta.url).pathname, "new"],
  {
    env: {
      ...process.env,
      GATEWAY_DIRECT: "false",
      WARTIME_RUN_CONFIG: root + "config.json",
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let pending = "",
  stderr = "",
  last: any,
  done = false;
const exited = new Promise((r) =>
  child.once("exit", () => {
    done = true;
    r(null);
  }),
);
child.stdout.on("data", (b) => {
  pending += b;
  for (;;) {
    const end = pending.indexOf("\n");
    if (end < 0) break;
    const line = pending.slice(0, end);
    pending = pending.slice(end + 1);
    try {
      last = JSON.parse(line);
    } catch {}
  }
});
child.stderr.on("data", (b) => (stderr += b));
let evidence: any;
try {
  const deadline = Date.now() + 60000;
  while (!done && last?.status !== "CONTROLLER_READY" && Date.now() < deadline)
    await Bun.sleep(30);
  if (last?.status === "CONTROLLER_READY") {
    const call = (operation: string, args: any = {}) =>
      tool(last.socket, { operation, ...args }) as Promise<any>;
    const s = await call("status"),
      p = s.observation.player;
    const token = await call("goal", {
      goal: {
        description:
          "One authorized fresh-account live startup smoke; verify one nearby step",
      },
    });
    const accepted = await call("submit", {
      proposal: {
        id: "single-live-step",
        token,
        expiresAt: Date.now() + 30000,
        steps: [
          {
            action: "walk",
            x: p.worldX + 1,
            z: p.worldZ,
            level: p.level,
            timeoutMs: 15000,
            expect: [
              {
                type: "position",
                x: p.worldX + 1,
                z: p.worldZ,
                level: p.level,
              },
            ],
          },
        ],
      },
    });
    let verified = false;
    const end = Date.now() + 20000;
    while (Date.now() < end) {
      const s = await call("status");
      if (s.lastEpisodeRoutineId === accepted.id) {
        verified = true;
        break;
      }
      if (s.phase === "PAUSED" || s.phase === "BLOCKED") break;
      await Bun.sleep(30);
    }
    evidence = {
      status: verified
        ? "ACTION_VERIFIED"
        : "CONTROLLER_READY_ACTION_UNVERIFIED",
      controllerReady: true,
      actionVerified: verified,
    };
  } else
    evidence = {
      status: "BLOCKED",
      reason: last?.reason ?? "ENTRY_DEADLINE",
      controllerReady: false,
      actionVerified: false,
    };
  if (last?.runId) {
    const record = JSON.parse(
      await readFile(
        config.runtimeRoot + "/" + last.runId + "/run.json",
        "utf8",
      ),
    );
    const a = record.accounts.at(-1);
    for (const item of record.accounts)
      if (stderr.includes(item.password)) throw new Error("CREDENTIAL_LEAK");
    evidence = {
      ...evidence,
      privateConfigCreated: true,
      loginAttempted: a.evidence.loginAttempted,
      clientLoggedIn: a.evidence.clientLoggedIn ?? false,
      freshStateConfirmed: a.evidence.freshStateConfirmed ?? false,
      accountsInPrivateRecord: record.accounts.length,
      replacementsUsed: record.replacementsUsed,
    };
  }
  evidence.world = config.world;
  evidence.gateway = config.gateway;
  evidence.accountNamesOrCredentialsPublished = false;
  await writeFile(root + "evidence.json", JSON.stringify(evidence, null, 2), {
    mode: 0o600,
  });
  console.log(JSON.stringify(evidence));
} finally {
  if (!done) {
    child.kill("SIGINT");
    await exited;
  }
}
