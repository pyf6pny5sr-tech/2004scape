// Optional REAL LOCAL typed player-target test. No chat, no remote accounts.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { BotSDK } from "../../../sdk/index";
import { BotActions } from "../../../sdk/actions";
import { strictStatus } from "../ownership.mjs";
import { startStandalone } from "../host";
import { tool } from "../client.mjs";
const readEnv = async (path: string) =>
  Object.fromEntries(
    (await readFile(path, "utf8"))
      .split("\n")
      .filter((l) => l.includes("="))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
  );
if (!process.env.WARTIME_LOCAL_BOT_ENV || !process.env.WARTIME_LOCAL_PEER_ENV)
  throw new Error("TWO_LOCAL_DISPOSABLE_ENV_FILES_REQUIRED");
const main = await readEnv(process.env.WARTIME_LOCAL_BOT_ENV),
  peer = await readEnv(process.env.WARTIME_LOCAL_PEER_ENV);
if (
  main.SERVER !== "localhost:8888" ||
  peer.SERVER !== "localhost:8888" ||
  main.BOT_USERNAME === peer.BOT_USERNAME
)
  throw new Error("TWO_DISTINCT_LOCAL_CHARACTERS_REQUIRED");
for (const e of [main, peer])
  if (
    (
      await strictStatus(
        "http://localhost:8888/status/" + encodeURIComponent(e.BOT_USERNAME),
      )
    ).state !== "ZERO"
  )
    throw new Error("LOCAL_OWNER_NOT_ZERO");
const peerSDK = new BotSDK({
  botUsername: peer.BOT_USERNAME,
  password: peer.PASSWORD,
  gatewayUrl: "ws://localhost:7780/",
  autoReconnect: false,
  autoLaunchBrowser: false,
});
try {
  await peerSDK.connect();
  const result = await new BotActions(peerSDK).walkTo(3244, 3209, 0, {
    timeout: 30000,
  });
  if (!result.success) throw new Error("PEER_ROUTE_FAILED");
} finally {
  await peerSDK.disconnect();
}
const root = new URL("../../.wartime/v2-cloud-player/", import.meta.url)
  .pathname;
await mkdir(root, { recursive: true, mode: 0o700 });
process.env.GATEWAY_DIRECT = "false";
process.env.WARTIME_GAME_PASSWORD = main.PASSWORD;
const config = {
  world: "http://localhost:8888",
  gateway: "ws://localhost:7780/",
  character: main.BOT_USERNAME,
  socket: root + "host.sock",
  directory: root + "memory",
  safety: { eatAtHp: 4 },
  handoff: {
    previousOwnerStopped: true,
    acceptNonAtomicGatewayRisk: true,
    world: "http://localhost:8888",
    character: main.BOT_USERNAME,
  },
};
const host = await startStandalone(config);
const call = (operation: string, args: any = {}) =>
  tool(config.socket, { operation, ...args }) as Promise<any>;
try {
  const s = await call("status"),
    target = s.observation.nearbyPlayers.find(
      (p: any) => p.name.toLowerCase() === peer.BOT_USERNAME.toLowerCase(),
    );
  if (!target) throw new Error("PEER_NOT_OBSERVED");
  const token = await call("goal", {
    goal: {
      description:
        "Verify local peaceful-zone typed player attack refusal; no claim of PvP competence",
    },
  });
  await call("submit", {
    proposal: {
      id: "peaceful-player-test",
      token,
      expiresAt: Date.now() + 15000,
      steps: [
        {
          action: "attack_player",
          target: { kind: "player", index: target.index, name: target.name },
          expect: [
            { type: "combat_target", kind: "player", index: target.index },
          ],
          timeoutMs: 7000,
        },
      ],
    },
  });
  const started = performance.now();
  let final;
  while (performance.now() - started < 10000) {
    final = await call("status");
    if (final.phase === "PAUSED" || final.metrics.counts.verifiedActions >= 1)
      break;
    await Bun.sleep(30);
  }
  const engaged = (final.metrics.counts.verifiedActions ?? 0) >= 1;
  if (
    !engaged &&
    ![
      "SDK_NOT_ATTACKABLE",
      "COMBAT_TARGET_ONLY_IS_NOT_SERVER_ACCEPTANCE",
    ].includes(final.reason)
  )
    throw new Error("PLAYER_PROBE_UNVERIFIED " + final.reason);
  const evidence: any = {
    scope:
      "Real isolated local typed player targeting; server may accept or refuse under its own rules",
    result: "passed",
    outcome: engaged
      ? "observed_player_combat_target"
      : final.reason === "SDK_NOT_ATTACKABLE"
        ? "server_refused_not_attackable"
        : "client_target_only_unverified",
    targetKind: "player",
    targetIndex: target.index,
    reason: final.reason,
    beforeHp: s.observation.player.hp,
    afterHp: final.observation.player.hp,
    verifiedActions: final.metrics.counts.verifiedActions ?? 0,
    metrics: final.metrics,
    noChatSent: true,
    limits:
      "Target engagement alone is not a kill, sustained duel, tactical competence or evidence for the online service.",
  };
  if (final.phase === "PAUSED") await call("resume");
  const escapeToken = await call("goal", {
    goal: {
      description:
        "End the local player probe with a verified escape to the open village tile",
    },
  });
  await call("submit", {
    proposal: {
      id: "local-player-escape",
      token: escapeToken,
      expiresAt: Date.now() + 60000,
      steps: [
        {
          action: "escape",
          x: 3222,
          z: 3222,
          level: 0,
          timeoutMs: 30000,
          expect: [{ type: "position", x: 3222, z: 3222, level: 0 }],
        },
      ],
    },
  });
  const exitStart = performance.now();
  let escaped = false;
  while (performance.now() - exitStart < 30000) {
    const end = await call("status");
    if (
      end.observation.player.worldX === 3222 &&
      end.observation.player.worldZ === 3222 &&
      !end.active
    ) {
      escaped = true;
      break;
    }
    if (end.phase === "PAUSED") break;
    await Bun.sleep(30);
  }
  evidence.escapeVerified = escaped;
  if (!escaped) throw new Error("LOCAL_ESCAPE_UNVERIFIED");
  await writeFile(root + "evidence.json", JSON.stringify(evidence, null, 2), {
    mode: 0o600,
  });
  console.log(JSON.stringify(evidence));
} finally {
  await host.close();
}
