import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { WartimeController, checkExpectation } from '../controller.mjs';

async function fixture() {
  const directory=await mkdtemp(path.join(os.tmpdir(),'wartime-test-'));
  const state={tick:10,revision:10,inGame:true,player:{name:'wartime',worldX:3222,worldZ:3218,level:0,hp:10,maxHp:10,isDead:false,lifeId:1},inventory:[],equipment:[],skills:[{name:'Woodcutting',level:1,baseLevel:1,experience:0}],nearbyLocs:[{id:100,name:'Tree',x:3223,z:3218,level:0,distance:1,reachable:true,optionsWithIndex:[{text:'Chop down',opIndex:1}]}],nearbyNpcs:[],groundItems:[],dialog:{isOpen:false,options:[]},bank:{isOpen:false,items:[]}};
  let age=0,received=1000;
  const calls=[];
  const sdk={config:{gatewayUrl:'wss://rs-sdk-demo.fly.dev/gateway',botUsername:'wartime',password:'TEST_CREDENTIAL_NOT_FOR_OUTPUT'},isConnected:()=>true,getState:()=>state,getStateAge:()=>age,getStateReceivedAt:()=>received,getConnectionMode:()=>'control',waitForCondition:async fn=>{if(fn(state))return state;throw new Error('waitForCondition timed out');}};
  const update=()=>{state.tick++;state.revision++;received++;};
  const bot={chopTree:async target=>{calls.push(target);state.inventory.push({id:1511,name:'Logs',slot:state.inventory.length,count:1});state.skills[0].experience+=25;update();return {success:true};},walkTo:async(x,z)=>{calls.push([x,z]);state.player.worldX=x;state.player.worldZ=z;update();return {success:true};}};
  const controller=new WartimeController({sdk,bot,directory});
  return {controller,sdk,bot,state,calls,update,directory,setAge:v=>age=v};
}
const chop=()=>({goal:'Obtain one log',recordIds:[],steps:[{action:'chop',target:{name:'Tree'},expect:[{type:'inventory_gain',item:{name:'Logs'},amount:1},{type:'xp_gain',skill:'Woodcutting',amount:1}]}]});

test('observed inventory and XP changes verify a skill; snapshots survive mutable SDK state',async()=>{
  const f=await fixture();const run=await f.controller.runPlan(chop());
  assert.equal(run.status,'verified');assert.equal(run.steps[0].before.inventory.length,0);assert.equal(run.steps[0].after.inventory.length,1);
  const skill=await f.controller.memory.remember('chop_tree',run.id,'Collect one log from a visible tree.');
  assert.equal(skill.episodeId,run.id);
  f.state.nearbyLocs[0].x=3300;
  const replay=await f.controller.runSkill('chop_tree');assert.equal(replay.status,'verified');assert.equal(f.calls[1].x,3300);
  const stored=await readFile(path.join(f.controller.memory.directory,'episodes',run.id+'.json'),'utf8');
  assert.ok(!stored.includes('TEST_CREDENTIAL'));assert.ok(!JSON.stringify(f.controller.observe()).includes('TEST_CREDENTIAL'));
});
test('dispatch success without an observed effect cannot be saved as a learned skill',async()=>{
  const f=await fixture();f.bot.chopTree=async()=>({success:true,phase:'dispatch'});
  const run=await f.controller.runPlan(chop());assert.equal(run.status,'needs_replan');assert.equal(run.steps[0].status,'unverified');
  await assert.rejects(f.controller.memory.remember('false_success',run.id,'No effect'),/observed success/);
});
test('stale state and a disconnected character prevent actions',async()=>{
  const f=await fixture();f.setAge(5000);
  assert.equal((await f.controller.runPlan(chop())).status,'needs_replan');assert.equal(f.calls.length,0);
  f.setAge(0);f.sdk.isConnected=()=>false;
  assert.equal((await f.controller.runPlan(chop())).status,'needs_replan');assert.equal(f.calls.length,0);
});
test('a death or respawn during an action invalidates apparent inventory success',async()=>{
  const f=await fixture();const original=f.bot.chopTree;
  f.bot.chopTree=async t=>{const result=await original(t);f.state.player.lifeId++;return result;};
  assert.equal((await f.controller.runPlan(chop())).status,'needs_replan');
});
test('inventory verification adds quantities across slots',()=>{
  const item={id:1511,name:'Logs',count:1};
  assert.ok(checkExpectation({type:'inventory_gain',item:{name:'Logs'},amount:2},{inventory:[item]},{inventory:[item,item,item]}));
});
test('all steps validate before the first action and failure stops the plan',async()=>{
  const f=await fixture();const invalid=chop();invalid.steps.push({action:'invented_method',expect:[]});
  await assert.rejects(f.controller.runPlan(invalid),/Unsupported action/);assert.equal(f.calls.length,0);
  f.bot.chopTree=async()=>({success:false,message:'No axe'});
  const plan=chop();plan.steps.push(chop().steps[0]);const run=await f.controller.runPlan(plan);
  assert.equal(run.steps.length,1);assert.equal(run.status,'needs_replan');
});
test('another gateway and observe-only connections cannot issue actions',async()=>{
  const f=await fixture();f.sdk.config.gatewayUrl='wss://example.com/gateway';
  assert.throws(()=>new WartimeController({sdk:f.sdk,bot:f.bot}),/configured only/);
  f.sdk.config.gatewayUrl='wss://rs-sdk-demo.fly.dev/gateway';f.sdk.getConnectionMode=()=>'observe';
  assert.equal((await f.controller.runPlan(chop())).status,'needs_replan');assert.equal(f.calls.length,0);
});
test('a held character lock rejects overlapping runs across controller instances',async()=>{
  const f=await fixture();let release;let started;
  const began=new Promise(r=>started=r);const blocked=new Promise(r=>release=r);const original=f.bot.chopTree;
  f.bot.chopTree=async t=>{started();await blocked;return original(t);};
  const first=f.controller.runPlan(chop());await began;
  const second=new WartimeController({sdk:f.sdk,bot:f.bot,directory:f.directory});
  await assert.rejects(second.runPlan(chop()),/active Wartime operation/);release();assert.equal((await first).status,'verified');
});
test('preconditions and target reachability are checked before dispatch',async()=>{
  const f=await fixture();const plan=chop();plan.steps[0].preconditions=[{type:'inventory_at_least',item:{name:'Bronze axe'},amount:1}];
  assert.equal((await f.controller.runPlan(plan)).status,'needs_replan');assert.equal(f.calls.length,0);
  f.state.nearbyLocs[0].reachable=false;
  assert.equal((await f.controller.runPlan(chop())).status,'needs_replan');assert.equal(f.calls.length,0);
});
test('an already satisfied destination sends no action and is not a newly learned skill',async()=>{
  const f=await fixture();const run=await f.controller.runPlan({goal:'Stand here',steps:[{action:'walk',x:3222,z:3218,level:0,expect:[{type:'position',x:3222,z:3218,level:0}]}]});
  assert.equal(run.status,'satisfied');assert.equal(f.calls.length,0);
  await assert.rejects(f.controller.memory.remember('walk_here',run.id,'No movement'),/observed success/);
});
test('malicious skill names cannot escape the private memory directory',async()=>{
  const f=await fixture();await assert.rejects(f.controller.memory.skill('../outside'),/skill name/);
});
