// Real host/Unix bridge and SDK modules with controlled observations; no live game or model inference.
import { test, expect } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { BotSDK } from "../../../sdk/index";
import { startInjected } from "../host";
import { agentTool, SDK_COMMIT } from "../bootstrap.mjs";
import { sourceIdentity } from "../identity.mjs";
import { processStamp } from "../run-store.mjs";
const exec = promisify(execFile);
test("current-agent CLI/bridge plans without another provider and labels turnaround honestly", async () => {
  const home = await mkdtemp(path.join(tmpdir(), "wartime-bridge-")),
    id = "r" + "b".repeat(32),
    socket = path.join(home, "runs", id, "host.sock");
  const sdk = new BotSDK({
    botUsername: "fixture",
    password: "PRIVATE_BRIDGE_SENTINEL",
    gatewayUrl: "wss://world.test/gateway",
    autoLaunchBrowser: false,
    autoReconnect: false,
  });
  const internal = sdk as any;
  const state: any = {
    inGame: true,
    tick: 1,
    revision: 1,
    player: {
      name: "fixture",
      hp: 10,
      maxHp: 10,
      lifeId: 1,
      isDead: false,
      worldX: 3222,
      worldZ: 3222,
      level: 0,
      animId: -1,
      combat: { inCombat: false },
    },
    inventory: [],
    equipment: [],
    skills: [],
    nearbyLocs: [],
    nearbyNpcs: [],
    nearbyPlayers: [],
    groundItems: [],
    gameMessages: [],
    combatEvents: [],
    dialog: { isOpen: false, options: [] },
    bank: { isOpen: false },
    interface: { isOpen: false },
    prayers: { activePrayers: Array(15).fill(false) },
  };
  internal.state = state;
  internal.stateReceivedAt = Date.now();
  internal.connectionState = "connected";
  internal.ws = { readyState: WebSocket.OPEN };
  let packets = 0;
  sdk.sendFindPath = async (x: number, z: number) => ({
    success: true,
    reachedDestination: true,
    waypoints: [{ x, z, level: 0 }],
  });
  internal.send = (m: any) => {
    packets++;
    queueMicrotask(() => {
      state.player.worldX = m.action.x ?? state.player.worldX;
      state.player.worldZ = m.action.z ?? state.player.worldZ;
      state.tick++;
      state.revision++;
      internal.handleMessage(JSON.stringify({ type: "sdk_state", state }));
      internal.pendingActions.get(m.actionId)?.resolve({ success: true });
    });
  };
  const host = await startInjected({
    sdk,
    config: {
      world: "https://world.test",
      gateway: "wss://world.test/gateway",
      character: "fixture",
      runId: id,
      socket,
      directory: path.join(home, "memory"),
      implementation: "NOT_A_SOURCE_PROOF",
    },
  });
  const ticker = setInterval(() => {
    state.tick++;
    state.revision++;
    internal.handleMessage(JSON.stringify({ type: "sdk_state", state }));
  }, 10);
  try {
    const identity = (await (
      await import("../client.mjs")
    ).tool(socket, { operation: "identity" })) as any;
    expect(identity.implementation.buildSha256).toBe(
      (await sourceIdentity()).buildSha256,
    );
    expect(identity.implementation.sdkCommit).toBe(SDK_COMMIT);
    expect(identity.planner.providerRequired).toBeFalse();
    expect(identity.planner.canWakeInactiveChat).toBeFalse();
    await writeFile(
      path.join(home, "prepared.json"),
      JSON.stringify({
        ...identity.implementation,
        world: identity.world,
        gateway: identity.gateway,
      }),
    );
    await writeFile(
      path.join(home, "active.json"),
      JSON.stringify({
        runId: id,
        socket,
        pid: process.pid,
        start: await processStamp(process.pid),
      }),
    );
    const context = JSON.parse(
      (
        await exec("node", [
          new URL("../agent.mjs", import.meta.url).pathname,
          "context",
          "--home",
          home,
        ])
      ).stdout,
    );
    expect(context.runtime.planner.mode).toBe("current_agent");
    expect(JSON.stringify(context)).not.toContain("PRIVATE_BRIDGE_SENTINEL");
    await agentTool(home, {
      operation: "goal",
      goal: { description: "Controlled bridge test, not frontier inference" },
    });
    const old: any = await agentTool(home, { operation: "planner_request" });
    await agentTool(home, {
      operation: "goal",
      goal: { description: "New generation" },
    });
    await expect(
      agentTool(home, {
        operation: "planner_complete",
        id: old.id,
        proposal: { id: "stale", expiresAt: Date.now() + 60000, steps: [] },
      }),
    ).rejects.toThrow("STALE_PLANNER_REQUEST");
    expect(packets).toBe(0);
    const request: any = await agentTool(home, {
      operation: "planner_request",
      context: { test: "controlled observations" },
    });
    const search: any = await agentTool(home, {
      operation: "search",
      query: "Cook's Assistant",
    });
    expect(search[0].evidence_refs.length).toBeGreaterThan(0);
    await exec("node", [
      new URL("../agent.mjs", import.meta.url).pathname,
      "complete",
      request.id,
      JSON.stringify({
        id: "one-walk",
        expiresAt: Date.now() + 60000,
        steps: [
          {
            action: "walk",
            x: 3223,
            z: 3222,
            level: 0,
            expect: [{ type: "position", x: 3223, z: 3222, level: 0 }],
          },
        ],
      }),
      "--home",
      home,
    ]);
    const end = Date.now() + 1000;
    while (!host.executor.lastEpisode && Date.now() < end) await Bun.sleep(1);
    const status: any = await agentTool(home, { operation: "status" });
    if (status.metrics.counts.verifiedActions !== 1)
      throw new Error(
        JSON.stringify({
          reason: status.reason,
          active: status.active,
          events: status.events,
        }),
      );
    expect(status.metrics.counts.verifiedActions).toBe(1);
    expect(status.metrics.counts.currentAgentToolPlansAccepted).toBe(1);
    expect(status.metrics.distributions.plannerTurnaroundMs.n).toBe(1);
    expect(
      status.events.find((e: any) => e.type === "planner_response")
        .isolatedInferenceTime,
    ).toBeFalse();
  } finally {
    clearInterval(ticker);
    await host.close();
    await rm(home, { recursive: true, force: true });
  }
});
