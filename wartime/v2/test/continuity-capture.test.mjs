import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat, rm } from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import { ContinuityEvidence, captureCommand } from '../continuity-capture.mjs';
function fixture(){
 const metrics={counts:{verifiedActions:4},samples:{latency:[2,3]},report(){return {counts:{...this.counts},distributions:{}};}};
 return {metrics,state:{tick:1,revision:1,player:{name:'PRIVATE_CHARACTER',worldX:1,worldZ:2,level:0,animId:-1},skills:[{name:'Woodcutting',level:43,experience:20000}],inventory:[],gameMessages:[{text:'PRIVATE_CHAT'}]},phase:'PLAYING',queue:[],policy:{id:'steady-1'},token:()=>({owner:'owner',session:1}),plannerRequests:()=>[]};
}
test('private passive recorder captures exact event boundaries and metric deltas without config/chat',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'continuity-capture-'));try{
  const e=fixture();e.config={password:'PRIVATE_PASSWORD'};let now=1000;
  const c=new ContinuityEvidence(e,path.join(dir,'events.jsonl'),()=>({implementation:{buildSha256:'actual'}}),()=>now);
  await c.prepare();c.begin(1000);now=1020;c.event({at:1020,type:'planner_requested',id:'p'});c.mark('claim',{id:'p'});
  e.metrics.counts.verifiedActions=6;e.metrics.samples.latency.push(8);e.state.tick=3;
  await c.end(1400);const rows=(await readFile(c.file,'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(rows[0].snapshot.metrics.counts.verifiedActions,4);
  assert.deepEqual(rows.at(-1).countsDelta,{verifiedActions:2});assert.deepEqual(rows.at(-1).sampleDelta,{latency:[8]});
  assert.equal(rows.at(-1).at,400);assert.equal(rows.at(-1).snapshot.observation.tick,3);
  assert.equal((await stat(c.file)).mode&0o777,0o600);
  const text=JSON.stringify(rows);for(const sentinel of ['PRIVATE_PASSWORD','PRIVATE_CHAT','PRIVATE_CHARACTER'])assert.ok(!text.includes(sentinel));
  assert.equal(rows.filter(r=>r.kind==='event').length,1);assert.equal(rows.filter(r=>r.kind==='claim').length,1);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('capture CLI has no model prerequisite, uses same owner and never invents a proposal',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'continuity-cli-'));try{
  const calls=[];const runtime={runId:'r',owner:'o',character:'c',world:'https://world.test',gateway:'wss://world.test/gateway',implementation:{buildSha256:'actual'}};
  const context={runtime,status:{phase:'PLAYING',continuation:{recipe:'woodcut_firemake',remainingActions:12,runwayMs:45000,area:{x:3200,z:3240,level:0,radius:12,character:'PRIVATE_CHARACTER'},character:'PRIVATE_CHARACTER'},observation:{inventory:[],skills:[],nearbyLocs:[]}},pendingPlannerRequests:[{id:'p',requestedAt:1000}]};
  const deps={call:async(home,p)=>{calls.push(p);if(p.operation==='agent_context')return context;if(p.operation==='measurement_status')return {running:true,windows:[]};if(p.operation==='measurement_claim')return context.status;if(p.operation==='planner_complete')return {id:'accepted'};}};
  const options={directory:dir,home:'/private'};await captureCommand('init',options,deps);const claimed=await captureCommand('claim',options,deps);
  assert.equal(claimed.continuation.remainingActions,12);assert.equal(claimed.continuation.runwayMs,45000);assert.deepEqual(claimed.continuation.area,{x:3200,z:3240,level:0,radius:12});assert.ok(!JSON.stringify(claimed).includes('PRIVATE_CHARACTER'));
  await assert.rejects(captureCommand('complete',options,deps),/EXPLICIT_AGENT_PROPOSAL/);
  await captureCommand('complete',{...options,proposal:{steps:[{action:'walk'}]}},deps);
  assert.equal(calls.filter(p=>p.operation==='planner_complete').length,1);
  assert.equal(calls.filter(p=>p.operation==='planner_request').length,0);
  context.runtime={...runtime,owner:'different'};await assert.rejects(captureCommand('context',options,deps),/OWNER_OR_BUILD_CHANGED/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('observation waits are rejected while a real gameplay-planning claim is open',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'continuity-watch-'));try{
  const runtime={owner:'o',implementation:{buildSha256:'b'}};const context={runtime,status:{phase:'PLAYING'}};
  const deps={call:async(h,p)=>p.operation==='measurement_status'?{running:true,windows:[{end:null}]}:context};
  const options={directory:dir};await captureCommand('init',options,deps);
  await assert.rejects(captureCommand('watch',options,deps),/WAIT_INSIDE_PLANNING/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
