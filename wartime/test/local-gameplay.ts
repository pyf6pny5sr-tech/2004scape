// Opt-in integration probe. Requires an already-running local engine, gateway and client.
// Run from an RS-SDK checkout: bun --env-file=bots/<disposable>/bot.env wartime/test/local-gameplay.ts
import { BotSDK } from '../../sdk/index';
import { BotActions } from '../../sdk/actions';
import main from '../agent';
import { mkdir, writeFile } from 'node:fs/promises';
import { dataDirectory } from '../knowledge.mjs';
if(process.env.WARTIME_TEST_WORLD_ORIGIN!=='http://localhost:8888' || process.env.WARTIME_TEST_GATEWAY!=='ws://localhost:7780/') throw new Error('Set explicit local test world and gateway; this probe never connects remotely.');
if(!process.env.BOT_USERNAME || !process.env.PASSWORD) throw new Error('Supply disposable local bot credentials privately.');
const sdk=new BotSDK({botUsername:process.env.BOT_USERNAME,password:process.env.PASSWORD,gatewayUrl:'ws://localhost:7780/',autoLaunchBrowser:false,autoReconnect:false});
const bot=new BotActions(sdk);
const call=(args:any)=>main({sdk,bot,args});
try {
  await sdk.connect();
  const observed=await call({operation:'observe'});
  const p=observed.observation.state.player;
  const step=(x:number,z:number)=>({action:'walk',x,z,level:p.level,expect:[{type:'position',x,z,level:p.level}]});
  const plan={goal:'Walk one tile and return to the observed starting tile',steps:[step(p.worldX+1,p.worldZ),step(p.worldX,p.worldZ)]};
  const episode=await call({operation:'run_plan',plan,timeoutMs:15000});
  if(episode.status!=='verified') throw new Error('Movement was not verified: '+JSON.stringify(episode));
  const name='cloud_roundtrip';
  const skill=await call({operation:'remember',name,episodeId:episode.id,description:'Two observed one-tile walks in the disposable local world.'});
  const replay=await call({operation:'run_skill',name,timeoutMs:15000});
  if(replay.status!=='verified') throw new Error('Replay was not verified: '+JSON.stringify(replay));
  const search=await call({operation:'search',query:"Cook's Assistant"});
  const record=await call({operation:'record',id:search[0].id});
  if(record.id!==search[0].id || !record.evidence_refs?.length) throw new Error('Cited retrieval failed');
  const result={world:observed.observation.world,client:'actual RS-SDK lite client',start:{x:p.worldX,z:p.worldZ,level:p.level},episode,skill,replay,retrieval:{id:record.id,title:record.title,evidence_refs:record.evidence_refs},status:'passed'};
  await mkdir(dataDirectory,{recursive:true});await writeFile(dataDirectory+'/local-gameplay.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify({status:result.status,world:result.world,start:result.start,steps:episode.steps.map((s:any)=>({status:s.status,before:[s.before.player.worldX,s.before.player.worldZ],after:[s.after.player.worldX,s.after.player.worldZ]})),replay:replay.status,retrieval:record.id}));
} finally {sdk.disconnect();}
