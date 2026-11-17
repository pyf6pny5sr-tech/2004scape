import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { validateContinuation } from '../continuity.mjs';
import { Executor } from "../executor.mjs";
import { policy as steady } from "../versions/steady.mjs";
import { policy as cautious } from "../versions/cautious.mjs";
import { strictStatus, authorizeStartup } from "../ownership.mjs";
import { validateCommand } from "../protocol.mjs";
const flush = () => new Promise((r) => setImmediate(r));
async function fixture(t, options = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "wartime-v2-"));
  let listener, connection;
  const calls = [];
  let age = 0,
    received = 1,
    connected = true;
  const state = {
    inGame: true,
    tick: 1,
    revision: 1,
    player: {
      name: "tester",
      hp: 10,
      maxHp: 10,
      lifeId: 1,
      isDead: false,
      level: 0,
      worldX: 3243,
      worldZ: 3208,
      animId: -1,
      combat: { inCombat: false },
    },
    inventory: [],
    skills: [],
    equipment: [],
    nearbyLocs: [
      { id: 409, name: "Altar", x: 3243, z: 3207, level: 0, reachable: true },
    ],
    nearbyNpcs: [],
    nearbyPlayers: [],
    gameMessages: [],
    dialog: { isOpen: false, options: [] },
    prayers: { activePrayers: Array(15).fill(false) },
  };
  const emit = (tick = true) => {
    if (tick) state.tick++;
    state.revision++;
    received++;
    listener?.(state);
  };
  const adapter = {
    state: () => state,
    age: () => age,
    receivedAt: () => received,
    connected: () => connected,
    controlled: () => true,
    bound: () => true,
    subscribe: (fn) => {
      listener = fn;
      return () => (listener = null);
    },
    onConnection: (fn) => {
      connection = fn;
      return () => {};
    },
    execute: async (c, b, signal, valid) => {
      if (!valid()) throw new Error("old");
      calls.push(c);
      state.player.worldX = c.x ?? state.player.worldX;
      state.player.worldZ = c.z ?? state.player.worldZ;
      emit();
      return { success: true };
    },
    verify: async (fn) => {
      if (!fn(state)) throw new Error("waitForCondition timed out");
      return structuredClone(state);
    },
  };
  const config = {
    world: "http://localhost:8888",
    gateway: "ws://localhost:7780/",
    character: "tester",
    directory,
    initialVersion: "steady-1",
    church: {
      operatorVerifiedWorldRules: true,
      x: 3243,
      z: 3208,
      level: 0,
      radius: 1,
      anchorId: 409,
      anchorRadius: 4,
      minHp: 8,
      playerClearance: 5,
    },
    ...options,
  };
  const executor = new Executor({
    adapter,
    config,
    policies: new Map([steady, cautious].map((p) => [p.id, p])),
  });
  await executor.start();
  executor.setGoal({ description: "test" });
  t.after(async () => {
    await executor.stop();
    await rm(directory, { recursive: true, force: true });
  });
  const proposal = (steps, extra = {}) => ({
    id: "p" + Math.random().toString(36).slice(2),
    token: executor.token(),
    expiresAt: Date.now() + 60000,
    steps,
    ...extra,
  });
  return {
    executor,
    adapter,
    state,
    calls,
    emit,
    proposal,
    setAge: (v) => (age = v),
    disconnect: () => {
      connected = false;
      connection("disconnected");
    },
  };
}

const grant=(state,extra={})=>({recipe:'woodcut_firemake',target:{name:'Tree'},log:{name:'Logs'},area:{x:3243,z:3208,level:0,radius:8},maxActions:6,expiresAt:Date.now()+90000,minHp:10,fireTiles:[{x:3244,z:3206},{x:3246,z:3209}],...extra});
const chop={action:'chop',target:{name:'Tree'},expect:[{type:'inventory_gain',item:{name:'Logs'},amount:1}]};
function resources(f){f.state.nearbyLocs.push({id:1278,name:'Tree',x:3245,z:3209,level:0,reachable:true,distance:2});f.state.skills=[{name:'Woodcutting',experience:0},{name:'Firemaking',experience:0}];f.adapter.execute=async(c,b,signal,valid)=>{assert.ok(valid());f.calls.push(c);if(c.action==='chop'){f.state.inventory.push({id:1511,name:'Logs',count:1});f.state.skills[0].experience+=25;}else if(c.action==='burn_logs'){f.state.inventory.splice(f.state.inventory.findIndex(i=>i.name==='Logs'),1);f.state.skills[1].experience+=40;}else{f.state.player.worldX=c.x;f.state.player.worldZ=c.z;}f.emit();return {success:true};};}
test('finite approved reserve dispatches useful work while real planner promise is unresolved',async t=>{const f=await fixture(t);resources(f);f.executor.submit(f.proposal([chop],{continuation:grant(f.state,{maxActions:4})}));for(let i=0;i<12;i++){await flush();f.emit();}assert.ok(f.executor.metrics.counts.verifiedActions>=4);assert.ok(f.executor.metrics.counts.dispatchesWhilePlannerPending>=2);assert.ok(f.executor.planning.size>0);assert.equal(f.executor.continuation,null);assert.equal(f.executor.phase,'PLAYING');});
test('request/renewal leaves active approved action intact and explicit work yields reserve',async t=>{const f=await fixture(t);resources(f);let release;f.adapter.execute=async(c)=>{f.calls.push(c);await new Promise(r=>release=r);f.state.inventory.push({id:1511,name:'Logs',count:1});f.emit();return {success:true};};f.executor.submit(f.proposal([chop],{continuation:grant(f.state)}));const active=f.executor.active;const req=f.executor.plannerRequests()[0];f.executor.completePlan(req.id,f.proposal([chop],{continuation:grant(f.state,{maxActions:2})}));assert.equal(f.executor.active,active);assert.equal(active.abort.signal.aborted,false);assert.equal(f.executor.queue.length,1);release();await flush();await f.executor.stop();});
test('fresh expected effects reconcile failed helper, but not old life or cancellation',async t=>{const f=await fixture(t);resources(f);const successful=f.adapter.execute;f.adapter.execute=async(...args)=>{await successful(...args);return {success:false,message:"Tree was felled by someone else"};};f.executor.submit(f.proposal([chop]));await flush();assert.equal(f.executor.metrics.counts.verifiedActions,1);assert.equal(f.executor.metrics.counts.helperFailuresReconciledByFreshEffect,1);});
test('reconciliation cannot turn life-mismatched state into verified success',async t=>{const f=await fixture(t);resources(f);f.adapter.execute=async()=>{f.state.inventory.push({id:1511,name:'Logs',count:1});f.emit();f.state.player.lifeId=99;return {success:false,message:"Tree was felled by someone else"};};f.executor.submit(f.proposal([chop]));await flush();assert.equal(f.executor.metrics.counts.verifiedActions??0,0);});
test('continuation approval rejects arbitrary combat, stale scope and expired grants',async t=>{const f=await fixture(t);resources(f);assert.throws(()=>f.executor.submit(f.proposal([chop],{continuation:grant(f.state,{recipe:'combat'})})),/INVALID_CONTINUATION/);assert.throws(()=>f.executor.submit(f.proposal([chop],{continuation:grant(f.state,{expiresAt:Date.now()-1})})),/CONTINUATION_EXPIRY/);const stale=f.proposal([chop],{continuation:grant(f.state)});f.executor.setGoal({description:'different'});assert.throws(()=>f.executor.submit(stale),/STALE_PLAN/);});

test('untrusted fire tile properties cannot override generated action/expectation',async t=>{const f=await fixture(t);resources(f);const g=validateContinuation(grant(f.state,{fireTiles:[{x:3244,z:3206,action:'attack_player',target:{kind:'player',index:4},type:'combat_target'}]}),f.state,f.executor.token());assert.deepEqual(g.fireTiles,[{x:3244,z:3206}]);});
test('unknown network failure cannot resume reserve or retry from fresh cache',async t=>{const f=await fixture(t);resources(f);f.adapter.execute=async()=>{throw Error('NETWORK_POLICY_DENIED');};f.executor.submit(f.proposal([chop],{continuation:grant(f.state)}));await flush();assert.equal(f.executor.phase,'BLOCKED');assert.equal(f.executor.continuation,null);for(let i=0;i<6;i++)f.emit();assert.equal(f.executor.active,null);});
test('full inventory without approved logs waits without gathering commands',async t=>{const f=await fixture(t);resources(f);f.state.inventory=Array.from({length:28},(_,i)=>({id:i,name:'Other',count:1}));f.emit();f.executor.continuation=validateContinuation(grant(f.state),f.state,f.executor.token());f.executor.schedule();assert.equal(f.calls.length,0);assert.ok(f.executor.continuation);assert.equal(f.executor.phase,'PLAYING');assert.equal(f.executor.blockReason,'FULL_INVENTORY');});

test('exact coordinate gather lease cannot be assigned to a nearer same-name tree',async t=>{const f=await fixture(t);resources(f);f.state.nearbyLocs.push({id:1278,name:'Tree',x:3244,z:3208,level:0,reachable:true,distance:1});f.emit();f.executor.submit(f.proposal([{...chop,target:{name:'Tree',id:1278,x:3245,z:3209}}]));await flush();assert.equal(f.executor.gatherLease.target.x,3245);assert.equal(f.executor.gatherLease.target.z,3209);assert.equal(f.executor.gatherLease.target.level,0);});
test('grant expiry is not extended by renewal during an active generated action',async t=>{const f=await fixture(t);resources(f);f.emit();f.executor.continuation=validateContinuation(grant(f.state),f.state,f.executor.token());let release,valid;f.adapter.execute=async(c,b,signal,v)=>{valid=v;await new Promise((r,j)=>{release=r;signal.addEventListener('abort',()=>j(Error('cancelled')),{once:true});});return {success:false,message:'Tree was felled by someone else'};};f.executor.schedule();const old=f.executor.active,oldGrant=old.grant;const replacement=f.proposal([chop],{continuation:grant(f.state)});f.executor.submit(replacement);const next=f.executor.continuation;old.expiresAt=Date.now()-1;f.executor.routine.expiresAt=Date.now()-1;f.emit();assert.ok(old.abort.signal.aborted);assert.equal(valid(),false);assert.notEqual(oldGrant.id,next.id);release();await flush();assert.equal(next.failures,0);await f.executor.stop();});


test('HP/combat/region changes do not automatically cancel approved gameplay',async t=>{const f=await fixture(t);resources(f);f.executor.submit(f.proposal([chop],{continuation:grant(f.state)}));await flush();f.state.player.hp=1;f.state.player.combat.inCombat=true;f.state.player.worldX=4000;f.emit();assert.equal(f.executor.phase,'PLAYING');assert.ok(f.executor.continuation);await f.executor.stop();});
test('resource absence waits with bounded backoff and keeps queued goal/grant',async t=>{const f=await fixture(t);resources(f);f.emit();f.executor.continuation=validateContinuation(grant(f.state),f.state,f.executor.token());f.state.nearbyLocs=[];f.emit();assert.equal(f.executor.phase,'PLAYING');assert.ok(f.executor.continuation);assert.ok(f.executor.continuation.retryAt>f.executor.tickSerial);assert.equal(f.calls.length,0);});
test('manual cancel revokes work and old callbacks without automatic restart',async t=>{const f=await fixture(t);resources(f);f.executor.submit(f.proposal([chop],{continuation:grant(f.state)}));await flush();f.executor.cancel();const n=f.calls.length;for(let i=0;i<10;i++){f.emit();await flush();}assert.equal(f.executor.phase,'PAUSED');assert.equal(f.executor.continuation,null);assert.equal(f.calls.length,n);});
test('church maintenance is absent from the active executor',async t=>{const f=await fixture(t);assert.equal(f.executor.requestMaintenance,undefined);assert.equal(f.executor.stage,undefined);});
test('ordinary failed work preserves independent queued commands and finite resource scope',async t=>{const f=await fixture(t);resources(f);f.adapter.execute=async()=>({success:false,reason:'resource_depleted',message:'Tree depleted'});f.executor.submit(f.proposal([chop],{continuation:grant(f.state)}));f.executor.submit(f.proposal([chop],{continuation:grant(f.state)}));await flush();assert.equal(f.executor.phase,'PLAYING');assert.ok(f.executor.continuation);assert.ok(f.executor.metrics.counts.boundedContinuationRecoveries>=1);await f.executor.stop();});

test('ordinary recovery waits for fresh late expected effects rather than a helper acknowledgement',async t=>{const f=await fixture(t);resources(f);f.emit();f.adapter.execute=async()=>({success:false,reason:'resource_depleted',message:'Tree depleted'});f.adapter.verify=async predicate=>{if(!predicate(f.state)){await new Promise(r=>setTimeout(r,2));f.state.inventory.push({id:1511,name:'Logs',count:1});f.state.skills[0].experience+=25;f.emit();}assert.ok(predicate(f.state));return structuredClone(f.state);};f.executor.submit(f.proposal([chop]));for(let i=0;i<8;i++)await new Promise(r=>setTimeout(r,2));assert.equal(f.executor.metrics.counts.verifiedActions,1);assert.equal(f.executor.metrics.counts.helperFailuresReconciledByFreshEffect,1);});
test('life transition invalidates old commands but retains finite ordinary goal authority',async t=>{const f=await fixture(t);resources(f);f.emit();f.executor.continuation=validateContinuation(grant(f.state),f.state,f.executor.token());const old=f.executor.token();f.state.player.lifeId++;f.emit();assert.equal(f.executor.phase,'PLAYING');assert.ok(f.executor.continuation);assert.notEqual(f.executor.token().session,old.session);assert.equal(f.executor.continuation.token.life,f.state.player.lifeId);await f.executor.stop();});

for(const command of ['cancel','stop'])test('manual '+command+' wins over retained life/stale resume authority',async t=>{const f=await fixture(t);resources(f);f.emit();f.executor.continuation=validateContinuation(grant(f.state),f.state,f.executor.token());f.setAge(5000);f.state.player.lifeId++;f.emit();assert.ok(f.executor.pendingResourceResume);await f.executor[command]();assert.equal(f.executor.pendingResourceResume,null);const n=f.calls.length;f.setAge(0);f.state.player.hp=10;f.state.player.isDead=false;for(let i=0;i<8;i++){f.emit();await flush();}assert.equal(f.calls.length,n);assert.equal(f.executor.continuation,null);assert.equal(f.executor.phase,command==='stop'?'STOPPED':'PAUSED');});

test('unexpected helper exceptions are retained and never retried as resource failures',async t=>{const f=await fixture(t);resources(f);f.adapter.execute=async()=>{throw Error('UNEXPECTED_IMPLEMENTATION_ERROR');};f.executor.submit(f.proposal([chop],{continuation:grant(f.state)}));await flush();assert.equal(f.executor.phase,'BLOCKED');assert.equal(f.executor.blockReason,'UNEXPECTED_IMPLEMENTATION_ERROR');assert.equal(f.executor.continuation,null);assert.equal(f.executor.metrics.counts.boundedContinuationRecoveries,undefined);});

for (const transition of ['life', 'clock', 'life_and_clock']) test('manual cancel survives later '+transition+' publications without refill or dispatch', async t => {
  const f = await fixture(t); resources(f); f.emit();
  f.executor.continuation = validateContinuation(grant(f.state), f.state, f.executor.token());
  f.executor.cancel();
  const calls = f.calls.length;
  const requests = f.executor.events.filter(e => e.type === 'planner_requested').length;
  if (transition.includes('life')) f.state.player.lifeId++;
  if (transition.includes('clock')) { f.state.tick = -1; f.state.revision = -1; }
  for (let i = 0; i < 8; i++) { f.emit(); await flush(); }
  assert.equal(f.executor.phase, 'PAUSED');
  assert.equal(f.executor.blockReason, 'MANUAL_CANCEL');
  assert.equal(f.executor.continuation, null);
  assert.equal(f.executor.pendingResourceResume, null);
  assert.equal(f.executor.plannerRequests().length, 0);
  assert.equal(f.executor.events.filter(e => e.type === 'planner_requested').length, requests);
  assert.equal(f.calls.length, calls);
});

const standingGrant=state=>({...grant(state),mode:'standing',expiresAt:undefined,maxActions:2});
test('standing approved goal works past old180s boundary through bounded chunks with one unserved planner',async t=>{
 const f=await fixture(t);resources(f);
 // Deterministic virtual wall-clock test, not live/model latency. Publications drive each dispatch.
 f.adapter.execute=async c=>{f.calls.push(c);if(c.action==='chop'){f.state.inventory.push({id:1511,name:'Logs',count:1});f.state.skills[0].experience+=25;}else{f.state.inventory=f.state.inventory.filter(i=>i.name!=='Logs');f.state.skills[1].experience+=40;}f.emit(false);return {success:true};};
 f.executor.submit(f.proposal([chop],{continuation:standingGrant(f.state)}));await flush();
 const pending=f.executor.plannerRequests()[0].id,realNow=Date.now;let now=realNow()+181000;
 try {Date.now=()=>now;for(let i=0;i<12;i++){now+=400;f.emit();await flush();}}finally{Date.now=realNow;}
 assert.ok(f.calls.length>=10);assert.ok(f.executor.metrics.counts.standingChunksStarted>=3);
 assert.ok(f.executor.planning.has(pending));assert.equal(f.executor.continuation.mode,'standing');assert.equal(f.executor.continuation.expiresAt,null);
 assert.ok(f.calls.every(c=>['chop','burn_logs'].includes(c.action)));assert.equal(f.executor.metrics.counts.continuationExpirations,undefined);
 await f.executor.stop();
});
test('rejected completion preserves request, standing authority, active routine and queue; correction succeeds',async t=>{
 const f=await fixture(t);resources(f);f.state.player.animId=888;f.emit();
 f.executor.submit(f.proposal([chop],{continuation:standingGrant(f.state)}));f.executor.submit(f.proposal([chop]));
 const req=f.executor.plannerRequests()[0],g=f.executor.continuation,r=f.executor.routine,q=[...f.executor.queue],ids=f.executor.proposalIds.size;
 const bad=f.proposal([{action:'burn_logs',log:{name:'Logs'},expect:[{type:'xp_gain',skill:'Firemaking',amount:1}]}]);
 assert.throws(()=>f.executor.completePlan(req.id,bad),/BURN_ITEM_SELECTOR_REQUIRED/);
 assert.ok(f.executor.planning.has(req.id));assert.equal(f.executor.continuation,g);assert.equal(f.executor.routine,r);assert.deepEqual(f.executor.queue,q);assert.equal(f.executor.proposalIds.size,ids);
 const good=f.proposal([chop]);f.executor.completePlan(req.id,good,'current_agent_tools');assert.ok(!f.executor.planning.has(req.id));assert.equal(f.executor.continuation,g);assert.equal(f.executor.queue.length,q.length+1);
 assert.throws(()=>f.executor.completePlan(req.id,good),/STALE_PLANNER_REQUEST/);
});
test('stale supplied generation, duplicate ID and full queue never consume pending completion',async t=>{
 const f=await fixture(t);resources(f);f.state.player.animId=888;f.emit();const original=f.proposal([chop],{continuation:standingGrant(f.state)});f.executor.submit(original);
 const req=f.executor.plannerRequests()[0],g=f.executor.continuation;
 assert.throws(()=>f.executor.completePlan(req.id,{...f.proposal([chop]),token:{...f.executor.token(),life:99}}),/STALE_PLAN/);assert.ok(f.executor.planning.has(req.id));
 assert.throws(()=>f.executor.completePlan(req.id,original),/DUPLICATE_PROPOSAL/);assert.ok(f.executor.planning.has(req.id));
 while(f.executor.queue.length<4)f.executor.submit(f.proposal([chop]));const ids=f.executor.proposalIds.size;
 assert.throws(()=>f.executor.completePlan(req.id,f.proposal([chop])),/BOUNDED_QUEUE_REQUIRED/);assert.equal(f.executor.queue.length,4);assert.equal(f.executor.proposalIds.size,ids);assert.equal(f.executor.continuation,g);assert.ok(f.executor.planning.has(req.id));
 const out=f.executor.completePlan(req.id,null);assert.equal(out.declined,true);assert.ok(!f.executor.planning.has(req.id));assert.equal(f.executor.queue.length,4);assert.equal(f.executor.continuation,g);
});
test('dedup capacity rejection is atomic and corrected completion can reuse pending request',async t=>{
 const f=await fixture(t);resources(f);f.state.player.animId=888;f.emit();const req=f.executor.requestPlan();for(let i=0;i<1000;i++)f.executor.proposalIds.set('occupied'+i,Date.now()+60000);
 assert.throws(()=>f.executor.completePlan(req.id,f.proposal([chop])),/DEDUPLICATION_CAPACITY/);assert.ok(f.executor.planning.has(req.id));assert.equal(f.executor.queue.length,0);
 f.executor.proposalIds.delete('occupied0');f.executor.completePlan(req.id,f.proposal([chop]));assert.ok(!f.executor.planning.has(req.id));
});
for(const revoke of ['cancel','stop','goal','disconnect'])test('standing authority cannot revive after '+revoke+' then life/clock transition',async t=>{
 const f=await fixture(t);resources(f);f.state.player.animId=888;f.emit();f.executor.submit(f.proposal([chop],{continuation:standingGrant(f.state)}));
 if(revoke==='goal')f.executor.setGoal({description:'New task without resource permission'});else if(revoke==='disconnect')f.disconnect();else await f.executor[revoke]();
 const n=f.calls.length;f.state.player.lifeId++;f.state.tick=-2;f.state.revision=-2;f.state.player.animId=-1;for(let i=0;i<5;i++){f.emit();await flush();}
 assert.equal(f.calls.length,n);assert.equal(f.executor.continuation,null);assert.equal(f.executor.pendingResourceResume,null);
 if(revoke==='cancel'){assert.equal(f.executor.phase,'PAUSED');assert.equal(f.executor.blockReason,'MANUAL_CANCEL');assert.equal(f.executor.plannerRequests().length,0);}
});
test('fire relocation is a checked moved-to empty tile, not an occupied position acknowledgement',async t=>{
 const f=await fixture(t);const command={action:'walk',x:3245,z:3208,level:0,tolerance:1,resourceFireMove:true,expect:[{type:'position',x:3245,z:3208,level:0,tolerance:1}]};const before=structuredClone(f.state);
 f.state.player.worldX=3244;f.state.nearbyLocs.push({id:2732,name:'Fire',x:3244,z:3208,level:0});assert.equal(f.executor.effectsMatch(command,before,f.state),false);
 f.state.nearbyLocs=[];assert.equal(f.executor.effectsMatch(command,before,f.state),true);assert.equal(f.executor.effectsMatch(command,f.state,f.state),false);
});
