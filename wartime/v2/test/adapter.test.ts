import { test, expect } from "bun:test";
import { BotSDK } from "../../../sdk/index";
import { SDKAdapter } from "../adapter";
import { copy } from "../protocol.mjs";
function harness() {
  const sdk = new BotSDK({
    botUsername: "tester",
    password: "PRIVATE_SENTINEL",
    gatewayUrl: "ws://localhost:7780/",
    autoLaunchBrowser: false,
    autoReconnect: false,
  });
  const i = sdk as any;
  const packets: any[] = [];
  i.state = {
    inGame: true,
    tick: 1,
    revision: 1,
    player: {
      name: "tester",
      worldX: 3200,
      worldZ: 3200,
      level: 0,
      hp: 10,
      maxHp: 10,
      lifeId: 1,
      isDead: false,
      animId: -1,
      combat: { inCombat: false },
    },
    inventory: [],
    skills: [],
    equipment: [],
    nearbyNpcs: [],
    nearbyPlayers: [],
    nearbyLocs: [],
    groundItems: [],
    gameMessages: [],
    combatEvents: [],
    dialog: { isOpen: false, options: [] },
    interface: { isOpen: false },
    bank: { isOpen: false },
    shop: { isOpen: false },
  };
  i.stateReceivedAt = Date.now();
  i.connectionState = "connected";
  i.ws = { readyState: WebSocket.OPEN };
  i.send = (m: any) => {
    packets.push(m);
    queueMicrotask(() =>
      i.pendingActions
        .get(m.actionId)
        ?.resolve({ success: false, reason: "cant_reach" }),
    );
  };
  return { sdk, i, packets, adapter: new SDKAdapter(sdk) };
}
test("real SDK read-only Proxy observations can be snapshotted without credentials", () => {
  const h = harness();
  const snapshot = copy(h.sdk.getState());
  expect(snapshot.player.hp).toBe(10);
  expect(JSON.stringify(snapshot)).not.toContain("PRIVATE_SENTINEL");
});
test("real BotActions uses distinct player index and NPC index packets", async () => {
  for (const kind of ["player", "npc"]) {
    const h = harness();
    const target = {
      kind,
      index: 42,
      id: 123,
      name: "same",
      x: 3201,
      z: 3200,
      distance: 1,
      reachable: true,
      optionsWithIndex: [{ text: "Attack", opIndex: 2 }],
    };
    h.i.state[kind === "player" ? "nearbyPlayers" : "nearbyNpcs"] = [target];
    const result = await h.adapter.execute(
      {
        action: kind === "player" ? "attack_player" : "attack_npc",
        target: { kind, index: 42 },
        timeoutMs: 1000,
      },
      copy(h.sdk.getState()),
      new AbortController().signal,
      () => true,
    );
    expect(result.success).toBeFalse();
    expect(h.packets).toHaveLength(1);
    const action = h.packets[0].action;
    expect(action.type).toBe(
      kind === "player" ? "interactPlayer" : "interactNpc",
    );
    expect(action[kind === "player" ? "playerIndex" : "npcIndex"]).toBe(42);
  }
});
test("disappeared or wrong-kind targets send no packet", async () => {
  const h = harness();
  await expect(
    h.adapter.execute(
      { action: "attack_player", target: { kind: "player", index: 42 } },
      copy(h.sdk.getState()),
      new AbortController().signal,
      () => true,
    ),
  ).rejects.toThrow("FRESH_TYPED_TARGET");
  expect(h.packets.length).toBe(0);
});
test("real SDK cancellation disposes listeners and blocks old dispatch callbacks", async () => {
  const h = harness();
  h.sdk.sendFindPath = async () => ({
    success: true,
    reachedDestination: true,
    waypoints: [{ x: 3208, z: 3200, level: 0 }],
  });
  h.i.send = (m: any) => {
    h.packets.push(m);
    queueMicrotask(() =>
      h.i.pendingActions.get(m.actionId)?.resolve({ success: true }),
    );
  };
  const abort = new AbortController();
  let valid = true;
  const work = h.adapter.execute(
    { action: "walk", x: 3208, z: 3200, level: 0, timeoutMs: 5000 },
    copy(h.sdk.getState()),
    abort.signal,
    () => valid,
  );
  await Bun.sleep(20);
  valid = false;
  abort.abort(new Error("PREEMPTED"));
  await expect(work).rejects.toThrow("PREEMPTED");
  await Bun.sleep(10);
  expect(h.i.pendingActions.size).toBe(0);
  expect(h.i.stateListeners.size).toBe(0);
  const count = h.packets.length;
  await Bun.sleep(10);
  expect(h.packets.length).toBe(count);
});
