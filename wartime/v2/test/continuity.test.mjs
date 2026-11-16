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
      if (!fn(state)) throw new Error("not observed");
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
test('bounded failure backoff cannot retry after goal cancellation or maintenance',async t=>{const f=await fixture(t);resources(f);f.adapter.execute=async()=>({success:false,message:"Tree was felled by someone else"});f.executor.submit(f.proposal([chop],{continuation:grant(f.state)}));await flush();assert.equal(f.executor.phase,'PLAYING');assert.equal(f.executor.continuation.consecutiveFailures,1);assert.ok(f.executor.continuation.retryAt>f.executor.tickSerial);f.executor.setGoal({description:'new goal'});for(let i=0;i<5;i++)f.emit();assert.equal(f.executor.continuation,null);assert.equal(f.executor.active,null);f.executor.submit(f.proposal([chop],{continuation:grant(f.state)}));await flush();f.executor.stage('cautious-2');f.executor.requestMaintenance('cautious-2');assert.equal(f.executor.continuation,null);await f.executor.stop();});
test('HP damage revokes continuation without further commands',async t=>{const f=await fixture(t);resources(f);f.executor.submit(f.proposal([chop],{continuation:grant(f.state)}));await flush();f.state.player.hp=9;f.emit();assert.equal(f.executor.phase,'PAUSED');assert.equal(f.executor.continuation,null);const n=f.calls.length;f.emit();assert.equal(f.calls.length,n);});
test('continuation approval rejects arbitrary combat, stale scope and expired grants',async t=>{const f=await fixture(t);resources(f);assert.throws(()=>f.executor.submit(f.proposal([chop],{continuation:grant(f.state,{recipe:'combat'})})),/INVALID_CONTINUATION/);assert.throws(()=>f.executor.submit(f.proposal([chop],{continuation:grant(f.state,{expiresAt:Date.now()-1})})),/CONTINUATION_EXPIRY/);const stale=f.proposal([chop],{continuation:grant(f.state)});f.executor.setGoal({description:'different'});assert.throws(()=>f.executor.submit(stale),/STALE_PLAN/);});

test('untrusted fire tile properties cannot override generated action/expectation',async t=>{const f=await fixture(t);resources(f);const g=validateContinuation(grant(f.state,{fireTiles:[{x:3244,z:3206,action:'attack_player',target:{kind:'player',index:4},type:'combat_target'}]}),f.state,f.executor.token());assert.deepEqual(g.fireTiles,[{x:3244,z:3206}]);});
test('unknown network failure cannot resume reserve or retry from fresh cache',async t=>{const f=await fixture(t);resources(f);f.adapter.execute=async()=>{throw Error('NETWORK_POLICY_DENIED');};f.executor.submit(f.proposal([chop],{continuation:grant(f.state)}));await flush();assert.equal(f.executor.phase,'PAUSED');assert.equal(f.executor.continuation,null);for(let i=0;i<6;i++)f.emit();assert.equal(f.executor.active,null);});
test('full inventory without approved logs yields without gathering commands',async t=>{const f=await fixture(t);resources(f);f.state.inventory=Array.from({length:28},(_,i)=>({id:i,name:'Other',count:1}));f.emit();f.executor.continuation=validateContinuation(grant(f.state),f.state,f.executor.token());f.executor.schedule();assert.equal(f.calls.length,0);assert.equal(f.executor.continuation,null);assert.equal(f.executor.phase,'PAUSED');assert.equal(f.executor.blockReason,'FULL_INVENTORY');});

test('exact coordinate gather lease cannot be assigned to a nearer same-name tree',async t=>{const f=await fixture(t);resources(f);f.state.nearbyLocs.push({id:1278,name:'Tree',x:3244,z:3208,level:0,reachable:true,distance:1});f.emit();f.executor.submit(f.proposal([{...chop,target:{name:'Tree',id:1278,x:3245,z:3209}}]));await flush();assert.equal(f.executor.gatherLease.target.x,3245);assert.equal(f.executor.gatherLease.target.z,3209);assert.equal(f.executor.gatherLease.target.level,0);});
test('grant expiry is not extended by renewal during an active generated action',async t=>{const f=await fixture(t);resources(f);f.emit();f.executor.continuation=validateContinuation(grant(f.state),f.state,f.executor.token());let release,valid;f.adapter.execute=async(c,b,signal,v)=>{valid=v;await new Promise((r,j)=>{release=r;signal.addEventListener('abort',()=>j(Error('cancelled')),{once:true});});return {success:false,message:'Tree was felled by someone else'};};f.executor.schedule();const old=f.executor.active,oldGrant=old.grant;const replacement=f.proposal([chop],{continuation:grant(f.state)});f.executor.submit(replacement);const next=f.executor.continuation;old.expiresAt=Date.now()-1;f.executor.routine.expiresAt=Date.now()-1;f.emit();assert.ok(old.abort.signal.aborted);assert.equal(valid(),false);assert.notEqual(oldGrant.id,next.id);release();await flush();assert.equal(next.failures,0);await f.executor.stop();});
test('no reachable target yields and repeated ordinary failures terminate within grant budget',async t=>{const f=await fixture(t);resources(f);f.emit();f.executor.continuation=validateContinuation(grant(f.state),f.state,f.executor.token());f.state.nearbyLocs=[];f.emit();assert.equal(f.executor.phase,'PAUSED');assert.equal(f.executor.continuation,null);assert.equal(f.calls.length,0);f.executor.setGoal({description:'test bounded failure'});resources(f);f.emit();f.adapter.execute=async()=>({success:false,message:'Tree was felled by someone else'});f.executor.submit(f.proposal([chop],{continuation:grant(f.state,{maxActions:20})}));for(let i=0;i<40;i++){await flush();f.emit();}assert.equal(f.executor.phase,'PAUSED');assert.equal(f.executor.continuation,null);assert.ok((f.executor.metrics.counts.boundedContinuationRecoveries??0)<=2);});

test('emergency monitor runs on the same damage publication that revokes a grant',async t=>{const f=await fixture(t,{safety:{eatAtHp:8}});resources(f);f.state.inventory.push({id:315,name:'Shrimps',count:1,optionsWithIndex:[{text:'Eat',opIndex:1}]});f.emit();f.executor.continuation=validateContinuation(grant(f.state),f.state,f.executor.token());f.state.player.hp=8;f.emit();assert.equal(f.executor.metrics.counts.emergencies,1);assert.equal(f.executor.continuation,null);await flush();});
test('maintenance cannot reconstruct expired generated work with a fresh TTL',async t=>{const f=await fixture(t);resources(f);f.emit();const g=validateContinuation(grant(f.state),f.state,f.executor.token());f.executor.continuation=g;f.executor.routine={id:'reserved',token:f.executor.token(),expiresAt:g.expiresAt,steps:[chop],repeat:1,index:0,cycle:0,results:[],continuation:true,continuationId:g.id};f.executor.stage('cautious-2');f.executor.requestMaintenance('cautious-2');f.executor.maintenance.saved.continuation.expiresAt=Date.now()-1;const deadline=Date.now()+500;while(f.executor.policy.id!=='cautious-2'&&Date.now()<deadline){f.emit();await new Promise(r=>setTimeout(r,2));}assert.equal(f.executor.continuation,null);assert.equal(f.executor.routine,null);assert.equal(f.calls.length,0);assert.equal(f.executor.policy.id,'cautious-2');});
test('two consecutive ordinary recoveries terminate even with alternative reachable trees',async t=>{const f=await fixture(t);resources(f);f.state.nearbyLocs.push(...[1,2,3].map(i=>({id:1278,name:'Tree',x:3243+i,z:3210,level:0,reachable:true,distance:i})));f.emit();f.adapter.execute=async()=>({success:false,message:'Tree was felled by someone else'});f.executor.submit(f.proposal([chop],{continuation:grant(f.state,{maxActions:20})}));for(let i=0;i<30;i++){await flush();f.emit();}assert.equal(f.executor.phase,'PAUSED');assert.equal(f.executor.continuation,null);assert.equal(f.executor.metrics.counts.boundedContinuationRecoveries,2);assert.equal(f.executor.metrics.counts.failures,3);});
