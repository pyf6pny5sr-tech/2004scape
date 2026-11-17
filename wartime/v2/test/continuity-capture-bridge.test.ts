// Actual persistent host/Unix transport hooks with controlled SDK observations; not live game evidence.
import { test, expect } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';import { tmpdir } from 'node:os';import path from 'node:path';
import { BotSDK } from '../../../sdk/index';import { startInjected } from '../host';import { tool } from '../client.mjs';
test('real host automatically persists exact boundary snapshots and request/claim/completion events',async()=>{
 const home=await mkdtemp(path.join(tmpdir(),'wartime-evidence-')),socket=path.join(home,'host.sock'),trace=path.join(home,'trace.jsonl');
 const sdk=new BotSDK({botUsername:'fixture',password:'PRIVATE_SENTINEL',gatewayUrl:'wss://world.test/gateway',autoLaunchBrowser:false,autoReconnect:false});
 const internal=sdk as any;
 const state:any={inGame:true,tick:1,revision:1,player:{name:'fixture',hp:10,maxHp:10,lifeId:1,isDead:false,worldX:3222,worldZ:3222,level:0,animId:-1,combat:{inCombat:false}},inventory:[],equipment:[],skills:[],nearbyLocs:[],nearbyNpcs:[],nearbyPlayers:[],groundItems:[],gameMessages:[],combatEvents:[],dialog:{isOpen:false,options:[]},bank:{isOpen:false},interface:{isOpen:false},prayers:{activePrayers:Array(15).fill(false)}};
 internal.state=state;internal.stateReceivedAt=Date.now();internal.connectionState='connected';internal.ws={readyState:WebSocket.OPEN};
 const host=await startInjected({sdk,config:{world:'https://world.test',gateway:'wss://world.test/gateway',character:'fixture',socket,directory:path.join(home,'memory'),measurementFile:trace}});
 const ticker=setInterval(()=>{state.tick++;state.revision++;internal.handleMessage(JSON.stringify({type:'sdk_state',state}));},20);
 try {
  const started:any=await tool(socket,{operation:'measurement_begin',durationMs:1000});
  const request:any=await tool(socket,{operation:'planner_request',context:{fixture:true}});
  await tool(socket,{operation:'measurement_claim',id:request.id});
  await expect(tool(socket,{operation:'planner_complete',id:request.id,proposal:{id:'bad',expiresAt:Date.now()+60000,steps:[{action:'burn_logs',log:{name:'Logs'},expect:[{type:'xp_gain',skill:'Firemaking',amount:1}]}]}})).rejects.toThrow('BURN_ITEM_SELECTOR_REQUIRED');
  const open:any=await tool(socket,{operation:'measurement_status'});expect(open.windows[0].end).toBeNull();
  expect((await tool(socket,{operation:'planner_requests'}) as any[]).some(r=>r.id===request.id)).toBeTrue();
  await tool(socket,{operation:'planner_complete',id:request.id,proposal:{id:'corrected',expiresAt:Date.now()+60000,steps:[{action:'walk',x:3222,z:3222,level:0,expect:[{type:'position',x:3222,z:3222,level:0}]}]}});
  expect((await tool(socket,{operation:'measurement_status'}) as any).windows[0].end).not.toBeNull();
  const decline:any=await tool(socket,{operation:'planner_request'});await tool(socket,{operation:'measurement_claim',id:decline.id});
  await tool(socket,{operation:'planner_complete',id:decline.id,proposal:null}); // Explicit decline, no fixture inference claim.
  const until=Date.now()+2000;let m:any;
  do{m=await tool(socket,{operation:'measurement_status'});if(m.running)await Bun.sleep(10);}while(m.running&&Date.now()<until);
  await host.close();
  const entries=(await readFile(trace+'.evidence.jsonl','utf8')).trim().split('\n').map(JSON.parse);
  const end=entries.at(-1),summary=JSON.parse(await readFile(trace+'.summary.json','utf8'));
  expect(end.kind).toBe('end');expect(end.at).toBe(summary.durationMs);expect(end.ended).toBe(summary.ended);
  expect(entries[0].identity.implementation.buildSha256).toBeTruthy();expect(entries[0].snapshot.observation.tick).toBeGreaterThanOrEqual(1);
  expect(entries.some(e=>e.kind==='event'&&e.event.type==='planner_requested')).toBeTrue();
  expect(entries.some(e=>e.kind==='claim')).toBeTrue();expect(entries.some(e=>e.kind==='completion_submission')).toBeTrue();
  expect(entries.filter(e=>e.kind==='completion_rejected').length).toBe(1);expect(entries.filter(e=>e.kind==='completion_accepted').length).toBe(1);expect(entries.filter(e=>e.kind==='completion_declined').length).toBe(1);
  expect(end.countsDelta.verifiedActions??0).toBe(0);expect(started.started).toBe(summary.started);
  expect(JSON.stringify(entries).includes('PRIVATE_SENTINEL')).toBeFalse();
 }finally{clearInterval(ticker);if(host.executor.phase!=='STOPPED')await host.close();await rm(home,{recursive:true,force:true});}
},5000);
