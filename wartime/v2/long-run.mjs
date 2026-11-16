// Opt-in passive measurement. Never dispatches game actions or changes scheduling.
import { mkdir, appendFile, chmod } from 'node:fs/promises';
import path from 'node:path';
export const buckets=['progress','busy_unproven','intentional_or_cooldown','pending_helper_ambiguous','no_approved_work','eligible_queued_undispatched','queued_undispatched','unknown'];
export function classifyTick(t){
 if(!t.fresh)return 'unknown';
 if(t.progress)return 'progress';
 if(t.busy)return 'busy_unproven';
 if(t.intentional||t.cooldown)return 'intentional_or_cooldown';
 if(t.active)return 'pending_helper_ambiguous';
 if(!t.approved)return 'no_approved_work';
 if(t.eligible)return 'eligible_queued_undispatched';
 return 'queued_undispatched'; // Eligibility/preconditions are not assumed from queue presence.
}
const totals=items=>Object.fromEntries((items??[]).map(i=>[i.id,0]).map(([id])=>[id,(items??[]).filter(i=>i.id===id).reduce((a,i)=>a+i.count,0)]));
export function compact(s){return {tick:s.tick,revision:s.revision,x:s.player?.worldX,z:s.player?.worldZ,level:s.player?.level,anim:s.player?.animId,combat:!!s.player?.combat?.inCombat,inventory:totals(s.inventory),xp:Object.fromEntries((s.skills??[]).map(i=>[i.name,i.experience]))};}
export class LiveMeasure {
 constructor(executor,file,clock=()=>Date.now()){this.e=executor;this.file=file;this.clock=clock;this.running=false;this.pending=[];this.writes=Promise.resolve();this.windows=[];this.rows=[];this.backlog=0;this.duplicates=0;this.resets=0;this.gaps=0;this.dropped=0;}
 async begin(durationMs){if(durationMs!==undefined&&(!Number.isInteger(durationMs)||durationMs<1000||durationMs>1200000))throw Error('INVALID_MEASUREMENT_DURATION');if(this.started)throw Error('MEASUREMENT_ALREADY_USED');if(this.running)throw Error('MEASUREMENT_ALREADY_RUNNING');await mkdir(path.dirname(this.file),{recursive:true,mode:0o700});await appendFile(this.file,'',{mode:0o600,flag:'wx'});await chmod(this.file,0o600);this.started=this.clock();this.running=true;this.write({kind:'begin',at:0});if(durationMs){if(!Number.isInteger(durationMs)||durationMs<1000||durationMs>1200000)throw Error('INVALID_MEASUREMENT_DURATION');this.timer=setTimeout(()=>{void this.end();},durationMs);}return {started:this.started};}
 claim(id){if(!this.running)throw Error('MEASUREMENT_NOT_RUNNING');if(!this.e.planning.has(id))throw Error('STALE_PLANNER_REQUEST');if(this.windows.some(w=>w.id===id))throw Error('PLANNER_ALREADY_CLAIMED');this.windows.push({id,start:this.clock()-this.started,end:null});return this.e.status();}
 complete(id){const w=this.windows.find(w=>w.id===id&&w.end===null);if(w)w.end=this.clock()-this.started;}
 write(row){this.pending.push(row);if(this.pending.length>=64)this.flush();}
 flush(){if(!this.pending.length)return;const batch=this.pending.splice(0);if(this.backlog>1024){this.dropped+=batch.length;return;}this.backlog=(this.backlog??0)+batch.length;this.writes=this.writes.then(()=>appendFile(this.file,batch.map(r=>JSON.stringify(r)).join('\n')+'\n')).catch(()=>{this.dropped+=batch.length;}).finally(()=>{this.backlog-=batch.length;});}
 observe(s){if(!this.running)return;const at=this.clock()-this.started,c=compact(s),p=this.previous;
 if(!Number.isFinite(c.tick)){this.invalid=(this.invalid??0)+1;return;}
 const reset=p&&(c.tick<p.tick||(c.revision!==undefined&&p.revision!==undefined&&c.revision<p.revision));
 if(!reset&&p&&c.revision!==undefined&&c.revision<=p.revision){this.duplicates++;return;}
 if(reset){this.resets++;this.finish(at);this.previous=null;}
 if(this.current&&c.tick!==this.current.tick){this.finish(at);if(p&&!reset&&c.tick>p.tick+1)this.gaps+=c.tick-p.tick-1;}
 const before=this.previous;
 const moved=!!before&&(c.x!==before.x||c.z!==before.z||c.level!==before.level);
 const delta=(a,b)=>Object.keys(a).some(k=>a[k]!== (b[k]??0))||Object.keys(b).some(k=>b[k]!== (a[k]??0));
 const effects=!!before&&(delta(c.inventory,before.inventory)||delta(c.xp,before.xp));
 const e=this.e;
 const t=this.current??={tick:c.tick,start:at,end:at,revision:c.revision,fresh:!!before,progress:false,moved:false,busy:false,active:false,approved:false,cooldown:false,intentional:false,eligible:false,publications:0};
 t.end=at;t.revision=c.revision;t.publications++;
 t.fresh=t.fresh&&e.fresh();t.progress||=moved||effects;t.moved||=moved;t.busy||=c.anim!==undefined&&c.anim!==-1||c.combat;
 t.active||=!!e.active||!!e.gatherLease;t.approved||=!!e.routine||e.queue.length>0;t.cooldown||=e.tickSerial<e.cooldownUntil;
 t.intentional||=e.phase!=='PLAYING';
 const r=e.routine??e.queue[0],cmd=r?.steps[r.index];
 t.eligible||=!!(cmd?.action==='walk'&&cmd.level===s.player?.level&&(!cmd.preconditions?.length)&&e.same(r.token)&&r.expiresAt>this.clock()&&!e.active&&e.phase==='PLAYING'&&e.tickSerial>=e.cooldownUntil&&(cmd.x!==c.x||cmd.z!==c.z)&&c.anim===-1);
 this.previous=c;
 }
 finish(at){if(!this.current)return;const t=this.current;if(at-t.end>this.e.config?.maxAgeMs||at-t.end>3000)t.fresh=false;t.end=at;t.bucket=classifyTick(t);this.rows.push(t);this.write({kind:'tick',...t});this.current=null;}
 async end(){if(!this.running)throw Error('MEASUREMENT_NOT_RUNNING');clearTimeout(this.timer);this.running=false;this.ended=this.clock();this.finish(this.ended-this.started);for(const w of this.windows)if(w.end===null){w.end=this.ended-this.started;w.incomplete=true;}this.write({kind:'end',at:this.ended-this.started,windows:this.windows});this.flush();await this.writes;const result=this.summary();await appendFile(this.file+".summary.json",JSON.stringify(result),{mode:0o600,flag:"wx"});return result;}
 summary(){const aggregate=rows=>{const counts=Object.fromEntries(buckets.map(b=>[b,0]));let idle=0,max=0,previous;for(const t of rows){counts[t.bucket]++;idle=['no_approved_work','eligible_queued_undispatched'].includes(t.bucket)?((previous&&t.tick===previous.tick+1)?idle+1:1):0;previous=t;max=Math.max(max,idle);}return {ticks:rows.length,counts,stationary:rows.filter(t=>!t.moved).length,confirmedIdle:counts.no_approved_work+counts.eligible_queued_undispatched,ambiguousPossibleIdle:counts.pending_helper_ambiguous+counts.queued_undispatched,longestConfirmedIdleTicks:max};};
 const planningRows=this.rows.filter(t=>this.windows.some(w=>t.start<(w.end??Infinity)&&t.end>w.start));
 return {running:this.running,started:this.started,ended:this.ended,durationMs:(this.ended??this.clock())-this.started,whole:aggregate(this.rows),planning:aggregate(planningRows),windows:this.windows.map(w=>({...w,...aggregate(this.rows.filter(t=>t.start<(w.end??Infinity)&&t.end>w.start))})),overhead:this.overhead??null,coverage:{duplicates:this.duplicates,resets:this.resets,gappedTicks:this.gaps,invalid:this.invalid??0,droppedRows:this.dropped},limitations:'Tick bucket aggregates evidence over publications; planning overlap means any temporal overlap, counted once in union. Queue presence does not prove eligibility. Confirmed idle means fresh, stationary, no effect/animation/combat, no helper, approved work or cooldown; server-hidden work remains unobservable.'};}
}
