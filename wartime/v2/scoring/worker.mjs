// Dedicated Node process: evaluation, evidence file reads, hashing, JSON serialization and fsync live here.
import fs from 'node:fs';import path from 'node:path';import {createInterface} from 'node:readline';import {ScoreEngine,hash,registry} from './engine.mjs';
const policyHash=hash(['immutable-procedure-evidence-v2',registry,fs.readFileSync(new URL('./engine.mjs',import.meta.url),'utf8')]);
let ownedLock=null;
const stamp=pid=>{try{const s=fs.readFileSync(`/proc/${pid}/stat`,'utf8'),p=s.slice(s.lastIndexOf(')')+2).split(' ');return p[0]==='Z'?null:p[19];}catch{return null;}};
function lease(directory,scope){const lock=path.join(directory,'scorer.lock'),ownerFile=path.join(lock,'owner.json');try{fs.mkdirSync(lock,{mode:0o700});}catch(e){if(e.code!=='EEXIST')throw e;const old=JSON.parse(fs.readFileSync(ownerFile,'utf8'));if(old.scopeHash!==hash(scope)||fs.readdirSync(lock).length!==1)throw Error('SCORE_LOCK_SCOPE_UNKNOWN');if(stamp(old.pid)===old.start)throw Error('SCORE_OWNERSHIP_LOCKED');fs.unlinkSync(ownerFile);fs.rmdirSync(lock);fs.mkdirSync(lock,{mode:0o700});}fs.writeFileSync(ownerFile,JSON.stringify({pid:process.pid,start:stamp(process.pid),scopeHash:hash(scope)}),{mode:0o600,flag:'wx'});ownedLock=lock;}
let engine,fd,config,processed=0,errors=0,cpuStart=process.cpuUsage(),bytes=0,lastError=null,sealed=false;
const send=m=>process.stdout.write(JSON.stringify(m)+'\n');
function evidence(file){const text=fs.readFileSync(file,'utf8');return {value:JSON.parse(text),digest:hash(text)};}
function apply(f,replaying=false){
 if(f.kind==='episode'||f.kind==='procedure'){
  if(engine.seen.has(f.id))return;if(engine.seen.size>=100000)throw Error('SCORE_CAPACITY');
  if(f.kind==='episode'){if(!/^\d+-[a-f0-9-]{36}$/.test(f.ref))throw Error('INVALID_EPISODE');const e=evidence(path.join(config.memoryDirectory,'episodes',f.ref+'.json'));if(f.evidenceHash&&f.evidenceHash!==e.digest)throw Error('EVIDENCE_HASH_CHANGED');f.evidenceHash=e.digest;engine.episode(e.value,f.ref);}
  else{
   if(!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(f.name))throw Error('INVALID_SKILL');
   let proof;
   if(replaying&&f.skillProof)proof=f.skillProof;
   else if(f.recordedSkillProof&&f.recordedSkillProof.episodeId===f.expectedEpisode){proof={world:f.recordedSkillProof.world,player:f.recordedSkillProof.player,episodeId:f.recordedSkillProof.episodeId};f.skillProof=proof;f.proofOrigin='DURABLE_MEMORY_WRITE_EVENT';}
   else{const skill=evidence(path.join(config.memoryDirectory,'skills',f.name+'.json'));proof={world:skill.value.world,player:skill.value.player,episodeId:skill.value.episodeId};f.skillProof=proof;f.skillFileHash=skill.digest;}
   if(!/^\d+-[a-f0-9-]{36}$/.test(proof.episodeId))throw Error('INVALID_EPISODE');
   const e=evidence(path.join(config.memoryDirectory,'episodes',proof.episodeId+'.json')),digest=hash([proof,e.digest]);
   if(f.evidenceHash&&f.evidenceHash!==digest)throw Error('EVIDENCE_HASH_CHANGED');f.evidenceHash=digest;engine.procedure(proof,e.value,f.name);
  }

  engine.seen.add(f.id);
 }else engine.ingest(f);
}
function append(x){const line=JSON.stringify(x)+'\n';if(bytes+Buffer.byteLength(line)>128*1024*1024)throw Error('SCORE_DISK_CAPACITY');fs.writeSync(fd,line);bytes+=Buffer.byteLength(line);}
function status(){const c=process.cpuUsage(cpuStart);return {...engine.status(),worker:{pid:process.pid,processed,errors,lastError,sealed,cpuMs:(c.user+c.system)/1000,rssBytes:process.memoryUsage().rss,heapLimitMiB:96,journalBytes:bytes}};}
const reader=createInterface({input:process.stdin});
for await(const line of reader){try{if(line.length>262144)throw Error('SCORE_MESSAGE_TOO_LARGE');const m=JSON.parse(line);
 if(m.op==='init'){
  config=m.config;fs.mkdirSync(config.directory,{recursive:true,mode:0o700});lease(config.directory,config.scope);const file=path.join(config.directory,'ledger.jsonl');engine=new ScoreEngine(config.scope);
  if(fs.existsSync(file)){const text=fs.readFileSync(file,'utf8');bytes=Buffer.byteLength(text);if(bytes>128*1024*1024||!text.endsWith('\n'))throw Error('SCORE_LEDGER_CORRUPT');const rows=text.trim().split('\n').map(JSON.parse);if(rows[0].policyHash!==policyHash)throw Error('SCORE_RULES_CHANGED_REQUIRES_AUDIT');if(hash(rows[0].scope)!==hash(config.scope))throw Error('SCORE_SCOPE_MISMATCH');for(const r of rows.slice(1))if(r.type==='input')apply(r.fact,true);}
  fd=fs.openSync(file,'a',0o600);fs.chmodSync(file,0o600);if(!bytes)append({type:'scope',schemaVersion:1,scope:config.scope,rulesHash:hash(registry),policyHash,initialScore:0});else append({type:'recovery',at:Date.now(),scoreAfter:engine.score,derivedAwardIds:engine.awards.map(x=>x.id),note:'Replayed durable input facts, including any tail input whose result append was interrupted.'});fs.fsyncSync(fd);send({op:'ready',status:status()});
 }else if(m.op==='batch'){
  const start=performance.now();for(const fact of m.facts){const before=engine.awards.length;try{apply(fact);append({type:'input',fact});append({type:'result',inputId:fact.id,records:engine.awards.slice(before),scoreAfter:engine.score});processed++;}catch(e){errors++;lastError=/^[A-Z0-9_]+$/.test(e.message)?e.message:'SCORE_EVALUATION_FAILED';engine.gaps++;engine.window=null;append({type:'rejected',inputId:fact.id,reason:lastError});}}
  fs.fsyncSync(fd);send({op:'ack',batch:m.batch,processingMs:performance.now()-start,status:status()});
 }else if(m.op==='flush'){fs.fsyncSync(fd);send({op:'flushed',id:m.id,status:status()});}
 else if(m.op==='seal'){sealed=true;fs.fsyncSync(fd);send({op:'sealed',status:status()});}
 else if(m.op==='page'){const cursor=Math.max(0,Math.floor(m.cursor??0)),limit=Math.min(100,Math.max(1,Math.floor(m.limit??30)));send({op:'page',id:m.id,rows:engine.awards.slice(cursor,cursor+limit),next:Math.min(engine.awards.length,cursor+limit)});}
 else if(m.op==='stop'){fs.fsyncSync(fd);fs.closeSync(fd);send({op:'stopped',status:status()});break;}
 else throw Error('UNKNOWN_SCORER_OPERATION');
 }catch(e){send({op:'failure',reason:/^[A-Z0-9_]+$/.test(e.message)?e.message:'SCORE_WORKER_FAILED'});process.exitCode=1;break;}}

if(ownedLock){try{const owner=JSON.parse(fs.readFileSync(path.join(ownedLock,'owner.json'),'utf8'));if(owner.pid===process.pid){fs.unlinkSync(path.join(ownedLock,'owner.json'));fs.rmdirSync(ownedLock);}}catch{}}
