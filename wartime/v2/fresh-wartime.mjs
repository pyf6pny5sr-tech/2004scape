// Fresh-agent profile. Wartime is the agent name; usernames/passwords are generated privately.
import {prepare,ensure,discover,agentTool} from './bootstrap.mjs';import {readFile} from 'node:fs/promises';import path from 'node:path';
export async function freshWartime(command='status',options={},deps={}){
 const home=path.resolve(options.home??new URL('../.wartime/fresh-wartime/',import.meta.url).pathname);
 if(command==='status')return (deps.discover??discover)(home);
 if(command==='tool')return (deps.agentTool??agentTool)(home,options.payload);
 if(!['setup','ensure','new'].includes(command))throw Error('UNKNOWN_FRESH_COMMAND');
 const current=await(deps.discover??discover)(home);
 if(current.state==='RUNNING'&&(current.runtime?.rangeTank!==true||!current.runtime?.scoring?.enabled))throw Error('EXISTING_RUN_IS_NOT_FRESH_WARTIME_PROFILE');
 if(current.prepared){let config;try{config=JSON.parse(await readFile(path.join(home,'run-config.json'),'utf8'));}catch{throw Error('FRESH_PROFILE_CONFIGURATION_UNKNOWN');}if(config.rangeTank!==true||config.scoring?.enabled!==true)throw Error('USE_NEW_PRIVATE_HOME_FOR_FRESH_WARTIME');}
 const selected={...options,home,world:options.world??'https://rs-sdk.maxbittker.com',gateway:options.gateway??'wss://rs-sdk.maxbittker.com/gateway',runOptions:{...options.runOptions,rangeTank:true,scoring:{enabled:true,sealAtMeasurementEnd:options.runOptions?.scoring?.sealAtMeasurementEnd===true}}};
 return command==='setup'?(deps.prepare??prepare)(selected):(deps.ensure??ensure)({...selected,newRun:command==='new'});
}
if(process.argv[1]&&new URL(import.meta.url).pathname===process.argv[1]){const [command='status',...args]=process.argv.slice(2),o={};for(let i=0;i<args.length;i++){if(['--home','--world','--gateway','--options'].includes(args[i])){const k=args[i++].slice(2);o[k==='options'?'runOptions':k]=k==='options'?JSON.parse(args[i]):args[i];}else if(command==='tool')o.payload=JSON.parse(args[i]);else throw Error('UNKNOWN_OPTION');}try{const r=await freshWartime(command,o);console.log(JSON.stringify(r,null,2));}catch(e){console.error(JSON.stringify({error:/^[A-Z0-9_]+$/.test(e.message)?e.message:'FRESH_SETUP_FAILED'}));process.exitCode=1;}}
