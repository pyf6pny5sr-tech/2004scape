// Optional passive evidence and short CLI for the continuity benchmark.
// No model/provider calls, account creation, planning decisions, or game dispatch.
import { appendFile, chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { compact } from './long-run.mjs';

const jsonCopy = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
export function safeContinuation(value) {
  if (!value) return null;
  const numeric = key => Number.isFinite(value[key]) ? value[key] : undefined;
  return {
    recipe: value.recipe === 'woodcut_firemake' ? value.recipe : undefined,
    remainingActions: numeric('remainingActions'), runwayMs: numeric('runwayMs'),
    expiresAt: numeric('expiresAt'), failures: numeric('failures'), backoffTicks: numeric('backoffTicks'),
    area: value.area ? Object.fromEntries(['x','z','level','radius'].filter(key => Number.isFinite(value.area[key])).map(key => [key,value.area[key]])) : null,
  };
}
export function evidenceSnapshot(executor) {
  const state = executor.state;
  return {
    token: jsonCopy(executor.token()),
    phase: executor.phase,
    reason: executor.blockReason ?? null,
    version: executor.policy?.id ?? null,
    active: !!executor.active,
    queueLength: executor.queue?.length ?? 0,
    routine: executor.routine ? { index: executor.routine.index, cycle: executor.routine.cycle, repeat: executor.routine.repeat } : null,
    continuation: safeContinuation(executor.continuationStatus?.()),
    observation: state ? compact(state) : null,
    skills: (state?.skills ?? []).map(s => ({ name: s.name, level: s.level, baseLevel: s.baseLevel, experience: s.experience })),
    metrics: executor.metrics.report(),
  };
}
export class ContinuityEvidence {
  constructor(executor, file, identity, clock = () => Date.now()) {
    this.executor = executor; this.file = file; this.identity = identity; this.clock = clock;
    this.pending = []; this.writes = Promise.resolve(); this.backlog = 0; this.dropped = 0; this.enqueued = 0; this.running = false;
  }
  async prepare() {
    if (this.prepared) throw Error('EVIDENCE_ALREADY_PREPARED');
    await mkdir(path.dirname(this.file), { recursive: true, mode: 0o700 });
    await appendFile(this.file, '', { flag: 'wx', mode: 0o600 }); await chmod(this.file, 0o600);
    this.prepared = true;
  }
  begin(started) {
    if (!this.prepared) throw Error('EVIDENCE_NOT_PREPARED');
    if (this.started !== undefined) throw Error('EVIDENCE_ALREADY_USED');
    this.started = started; this.running = true;
    this.initial = evidenceSnapshot(this.executor);
    this.sampleStarts = Object.fromEntries(Object.entries(this.executor.metrics.samples).map(([k,v]) => [k,v.length]));
    this.write({ kind: 'begin', at: 0, identity: this.identity(), snapshot: this.initial,
      pendingRequests: this.executor.plannerRequests(), capture: 'Passive events and exact-boundary snapshots; private, not a provider/inference trace' });
  }
  event(event) { if (this.running) this.write({ kind: 'event', at: event.at - this.started, event: jsonCopy(event) }); }
  mark(kind, details = {}) { if (this.running) this.write({ kind, at: this.clock() - this.started, ...jsonCopy(details) }); }
  write(row) { this.enqueued++; this.pending.push(row); if (this.pending.length >= 64) this.flush(); }
  flush() {
    if (!this.pending.length) return;
    const batch = this.pending.splice(0);
    if (this.backlog + batch.length > 1024) { this.dropped += batch.length; return; }
    this.backlog += batch.length;
    this.writes = this.writes.then(() => appendFile(this.file, batch.map(v => JSON.stringify(v)).join('\n') + '\n'))
      .catch(() => { this.dropped += batch.length; }).finally(() => { this.backlog -= batch.length; });
  }
  end(ended) {
    if (!this.running) return this.writes;
    this.running = false;
    const final = evidenceSnapshot(this.executor);
    const sampleDelta = Object.fromEntries(Object.entries(this.executor.metrics.samples).map(([k,v]) => [k, v.slice(this.sampleStarts[k] ?? 0)]));
    const countsDelta = Object.fromEntries(Object.entries(final.metrics.counts).map(([k,v]) => [k,v-(this.initial.metrics.counts[k] ?? 0)]));
    this.write({ kind: 'end', at: ended - this.started, ended, identity: this.identity(), snapshot: final, countsDelta, sampleDelta, droppedEvidenceRows: this.dropped });
    this.flush(); return this.writes.then(() => writeFile(this.file + ".summary.json", JSON.stringify({started:this.started,ended,droppedEvidenceRows:this.dropped,enqueuedRows:this.enqueued}) + "\n", {flag:"wx",mode:0o600}));
  }
}

function summary(context) {
  const status = context.status ?? context;
  const observation = status.observation ?? {};
  return {
    phase: status.phase, reason: status.reason ?? null, version: status.version,
    active: status.active, routine: status.routine, queueLength: status.queueLength,
    continuity: status.continuity ?? null,
    continuation: safeContinuation(status.continuation),
    hp: observation.player?.hp, position: observation.player ? [observation.player.worldX, observation.player.worldZ, observation.player.level] : null,
    inventory: (observation.inventory ?? []).map(i => ({ id: i.id, name: i.name, count: i.count })),
    skills: (observation.skills ?? []).filter(s => ['Woodcutting','Firemaking'].includes(s.name)),
    targets: (observation.nearbyLocs ?? []).filter(l => ['Tree','Oak'].includes(l.name)).map(l => ({ id:l.id,name:l.name,x:l.x,z:l.z,level:l.level,reachable:l.reachable })),
    pendingPlannerRequests: (context.pendingPlannerRequests ?? []).map(r => ({ id:r.id,requestedAt:r.requestedAt,context:r.context })),
    counts: status.metrics?.counts,
  };
}
function sameOwner(binding, context) {
  const actual = context.runtime;
  if (!actual || ['runId','owner','character','world','gateway'].some(k => actual[k] !== binding[k]) || actual.implementation?.buildSha256 !== binding.implementation?.buildSha256)
    throw Error('CAPTURE_OWNER_OR_BUILD_CHANGED');
}
async function privateJson(file,value,exclusive=false) {
  await writeFile(file,JSON.stringify(value,null,2)+'\n',{mode:0o600,flag:exclusive?'wx':'w'}); await chmod(file,0o600);
}
export async function captureCommand(command,options={},deps={}) {
  const call=deps.call ?? (await import('./bootstrap.mjs')).agentTool;
  const home=options.home ?? (await import('./bootstrap.mjs')).defaultHome;
  const directory=options.directory;
  if (!directory || !path.isAbsolute(directory)) throw Error('ABSOLUTE_PRIVATE_CAPTURE_DIRECTORY_REQUIRED');
  const file=name=>path.join(directory,name);
  const tool=payload=>call(home,payload);
  if(command==='init') {
    const c=await tool({operation:'agent_context'});
    if(c.status.phase!=='PLAYING') throw Error('CAPTURE_REQUIRES_READY_PLAYING_OWNER');
    await mkdir(directory,{recursive:true,mode:0o700});
    await privateJson(file('binding.json'),c.runtime,true);
    await privateJson(file('ready.json'),c,true);
    return {ready:true,runId:c.runtime.runId,buildSha256:c.runtime.implementation.buildSha256,plannerMode:'current_agent',providerRequired:false};
  }
  const binding=JSON.parse(await readFile(file('binding.json'),'utf8'));
  const current=await tool({operation:'agent_context'});sameOwner(binding,current);
  if(command==='begin') {
    if(current.status.phase!=='PLAYING')throw Error('CAPTURE_REQUIRES_READY_PLAYING_OWNER');
    const result=await tool({operation:'measurement_begin',durationMs:options.durationMs??1200000});
    await privateJson(file('window.json'),{...result,targetEnd:result.started+(options.durationMs??1200000),binding},true);
    return {...result,targetEnd:result.started+(options.durationMs??1200000)};
  }
  if(command==='context') { await privateJson(file('latest-context.json'),current);return summary(current); }
  if(command==='claim') {
    const measurement=await tool({operation:'measurement_status'});
    if(!measurement?.running)throw Error('MEASUREMENT_NOT_RUNNING');
    if(measurement.windows.some(w=>w.end===null))throw Error('PREVIOUS_CAPTURE_CLAIM_STILL_OPEN');
    const request=current.pendingPlannerRequests?.[0]??await tool({operation:'planner_request',context:{purpose:'Actual current-agent gameplay planning'}});
    const status=await tool({operation:'measurement_claim',id:request.id});
    await privateJson(file('current-request.json'),{request,claimedAt:Date.now()},false);
    await privateJson(file('latest-context.json'),{...current,status});
    return {requestId:request.id,...summary({...current,status})};
  }
  if(command==='complete') {
    const {request}=JSON.parse(await readFile(file('current-request.json'),'utf8'));
    const proposal=options.proposal;
    if(!proposal||typeof proposal!=='object')throw Error('EXPLICIT_AGENT_PROPOSAL_REQUIRED');
    proposal.id??=randomUUID();proposal.expiresAt??=Date.now()+120000;
    const result=await tool({operation:'planner_complete',id:request.id,proposal});
    await appendFile(file('submission-ledger.jsonl'),JSON.stringify({at:Date.now(),requestId:request.id,proposal,result})+'\n',{mode:0o600});
    return result;
  }
  if(command==='watch') {
    let m=await tool({operation:'measurement_status'});
    if(m?.windows.some(w=>w.end===null))throw Error('OBSERVATION_WAIT_INSIDE_PLANNING_CLAIM_NOT_ALLOWED');
    const seconds=options.seconds??45;
    if(!Number.isFinite(seconds)||seconds<0||seconds>45)throw Error('WATCH_SECONDS_OUT_OF_BOUNDS');
    const until=Date.now()+seconds*1000;
    while(m?.running&&Date.now()<until){await new Promise(r=>setTimeout(r,Math.min(5000,Math.max(0,until-Date.now()))));m=await tool({operation:'measurement_status'});}
    const c=await tool({operation:'agent_context'});sameOwner(binding,c);
    await privateJson(file('latest-context.json'),c);
    return {elapsedSeconds:m?.durationMs/1000,running:m?.running,ticks:m?.whole?.ticks,legacyClassifier:m?.whole,claimCount:m?.windows?.length,...summary(c)};
  }
  if(command==='stop') { await privateJson(file('before-stop.json'),current); return tool({operation:'stop'}); }
  throw Error('UNKNOWN_CAPTURE_COMMAND');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  const args=process.argv.slice(2),command=args.shift()??'context',options={};
  for(let i=0;i<args.length;i++){
    const key=args[i];if(!['--home','--directory','--duration-ms','--seconds','--proposal'].includes(key))throw Error('UNKNOWN_CAPTURE_OPTION');
    const value=args[++i];if(value===undefined)throw Error('MISSING_CAPTURE_OPTION_VALUE');
    options[key==='--duration-ms'?'durationMs':key.slice(2)]=key==='--proposal'?JSON.parse(value):['--seconds','--duration-ms'].includes(key)?Number(value):value;
  }
  try { console.log(JSON.stringify(await captureCommand(command,options),null,2)); }
  catch(error){console.error(JSON.stringify({error:/^[A-Z0-9_]+$/.test(error.message)?error.message:'CAPTURE_COMMAND_FAILED'}));process.exitCode=1;}
}
