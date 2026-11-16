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
test('real pinned SDK resource packets use fresh loc IDs and current inventory slots',async()=>{for(const action of ['chop','burn_logs']){const h=harness();h.i.state.nearbyLocs=[{id:1276,name:'Tree',x:3202,z:3200,level:0,reachable:true,distance:2}];h.i.state.inventory=[{id:590,name:'Tinderbox',slot:0,count:1},{id:1511,name:'Logs',slot:7,count:1}];const r=await h.adapter.execute({action,target:{name:'Tree',x:999,z:999},item:{name:'Logs'},timeoutMs:1000},copy(h.sdk.getState()),new AbortController().signal,()=>true);expect(r.success).toBeFalse();expect(h.packets.length).toBe(1);if(action==='chop'){expect(h.packets[0].action.type).toBe('interactLoc');expect(h.packets[0].action.locId).toBe(1276);expect(h.packets[0].action.x).toBe(3202);}else{expect(h.packets[0].action.type).toBe('useItemOnItem');expect(h.packets[0].action.sourceSlot).toBe(0);expect(h.packets[0].action.targetSlot).toBe(7);}}});
test('real pinned SDK fire dialog sends server option index and preserves refusal',async()=>{const h=harness();h.i.state.inventory=[{id:590,name:'Tinderbox',slot:0,count:1},{id:1511,name:'Logs',slot:7,count:1}];h.i.send=(m:any)=>{h.packets.push(m);queueMicrotask(()=>h.i.pendingActions.get(m.actionId)?.resolve({success:m.action.type==='useItemOnItem'}));};h.sdk.waitForCondition=async(predicate:any)=>{h.i.state.tick+=3;h.i.state.dialog={isOpen:true,options:[{text:'Continue',index:9}]};expect(predicate(h.sdk.getState())).toBeTrue();return h.sdk.getState()!;};await expect(h.adapter.execute({action:'burn_logs',item:{name:'Logs'},timeoutMs:1000},copy(h.sdk.getState()),new AbortController().signal,()=>true)).rejects.toThrow('RESOURCE_DIALOG_REFUSED');expect(h.packets[1].action.type).toBe('clickDialogOption');expect(h.packets[1].action.optionIndex).toBe(9);});
