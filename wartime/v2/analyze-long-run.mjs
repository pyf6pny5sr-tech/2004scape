// Offline analysis of the private boolean-only passive trace. No game connection.
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
export function reportBucket(t) {
 if(!t.fresh)return 'unknown';
 if(t.progress)return 'observed_progress';
 if(t.busy)return 'busy_without_proven_progress';
 if(t.cooldown)return 'cooldown';
 if(t.intentional)return !t.active&&!t.approved?'stationary_controller_pause':'pause_with_pending_work';
 if(t.active)return 'pending_helper_possible_idle';
 if(!t.approved)return 'no_approved_work_idle';
 return t.eligible?'eligible_walk_without_dispatch_idle':'queued_eligibility_unresolved';
}
const idle=new Set(['no_approved_work_idle','stationary_controller_pause','eligible_walk_without_dispatch_idle']);
const ambiguous=new Set(['pending_helper_possible_idle','queued_eligibility_unresolved','pause_with_pending_work']);
export function distribution(values){const a=[...values].sort((x,y)=>x-y);const q=p=>a.length?a[Math.max(0,Math.ceil(p*a.length)-1)]:null;return {n:a.length,p50:q(.5),p95:q(.95),p99:q(.99),min:a[0]??null,max:a.at(-1)??null};}
function union(ranges){const out=[];for(const [a,b] of ranges.sort((x,y)=>x[0]-y[0])){if(out.length&&a<=out.at(-1)[1])out.at(-1)[1]=Math.max(b,out.at(-1)[1]);else out.push([a,b]);}return out;}
export function analyzeTrace(rows,windows,durationMs){
 const aggregate=ranges=>{const selected=rows.map(t=>({t,ms:ranges.reduce((a,[s,e])=>a+Math.max(0,Math.min(t.end,e)-Math.max(t.start,s)),0)})).filter(({t,ms})=>ms>0||(t.end===t.start&&ranges.some(([s,e])=>t.start>=s&&t.start<e)));const counts={},seconds={};let longest=0,streak=0,streakMs=0,longestMs=0,previous;for(const {t,ms} of selected){const b=reportBucket(t);counts[b]=(counts[b]??0)+1;seconds[b]=(seconds[b]??0)+ms/1000;if(idle.has(b)){streak=previous&&t.tick===previous.tick+1?streak+1:1;streakMs=previous&&t.tick===previous.tick+1?streakMs+ms:ms;}else{streak=0;streakMs=0;}longest=Math.max(longest,streak);longestMs=Math.max(longestMs,streakMs);previous=t;}const n=selected.length;const count=set=>Object.entries(counts).reduce((a,[b,v])=>a+(set.has(b)?v:0),0);return {observedTicks:n,buckets:counts,estimatedObservationIntervalSeconds:seconds,physicallyStationaryTicks:selected.filter(({t})=>!t.moved).length,visibleIdleLowerBoundTicks:count(idle),visibleIdleLowerBoundPercent:n?100*count(idle)/n:0,possibleAdditionalIdleTicks:count(ambiguous),busyOrProgressTicks:(counts.observed_progress??0)+(counts.busy_without_proven_progress??0),longestVisibleIdleStreakTicks:longest,longestVisibleIdleStreakEstimatedSeconds:longestMs/1000,coveredObservationSeconds:selected.reduce((a,x)=>a+x.ms,0)/1000};};
 const whole=aggregate([[0,durationMs]]),planning=aggregate(union(windows.map(w=>[w.start,w.end??durationMs])));
 const cadence=rows.slice(1).filter((t,i)=>t.tick===rows[i].tick+1).map((t)=>t.start-rows[rows.indexOf(t)-1].start);
 return {durationMs,whole,claimedAgentToolIntervals:planning,planningWindows:windows.map((w,i)=>({index:i+1,startSeconds:w.start/1000,endSeconds:(w.end??durationMs)/1000,turnaroundMs:(w.end??durationMs)-w.start,incomplete:!!w.incomplete,...aggregate([[w.start,w.end??durationMs]])})),perMinute:Array.from({length:Math.ceil(durationMs/60000)},(_,i)=>({minute:i+1,...aggregate([[i*60000,Math.min(durationMs,(i+1)*60000)]])})),cadenceMs:distribution(cadence),jitterMs:distribution(cadence.slice(1).map((v,i)=>Math.abs(v-cadence[i]))),consistency:{exclusiveBucketSum:Object.values(whole.buckets).reduce((a,b)=>a+b,0),equalsObservedTicks:Object.values(whole.buckets).reduce((a,b)=>a+b,0)===whole.observedTicks,planningUnionDoesNotDoubleCount:planning.observedTicks<=whole.observedTicks}};
}
// Entire-window exclusions are an explicit transcript-audit input, never selected by outcome.
export function auditPlanningSubset(rows, windows, durationMs, excludedIndices) {
 if (!Array.isArray(excludedIndices) || new Set(excludedIndices).size !== excludedIndices.length ||
     excludedIndices.some(i => !Number.isInteger(i) || i < 1 || i > windows.length))
   throw Error('INVALID_AUDIT_WINDOW_INDICES');
 const excluded = [...excludedIndices].sort((a,b) => a-b);
 const included = windows.map((_,i) => i+1).filter(i => !excluded.includes(i));
 const selected = included.map(i => windows[i-1]);
 const result = analyzeTrace(rows, selected, durationMs);
 const ranges = union(selected.map(w => [w.start, w.end ?? durationMs]));
 return {
  selection: 'Conservative transcript audit; exclude whole mixed development/report-support windows, with no within-window time estimates or outcome-based selection',
  includedWindowIndices: included,
  excludedWindowIndices: excluded,
  claimedDurationMs: ranges.reduce((sum,[start,end]) => sum+end-start,0),
  aggregate: result.claimedAgentToolIntervals,
  windows: result.planningWindows.map((w,i) => ({...w,index:included[i]})),
 };
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const entries=(await readFile(process.argv[2],'utf8')).trim().split('\n').map(l=>JSON.parse(l));
 const end=entries.findLast(e=>e.kind==='end');if(!end)throw Error('MEASUREMENT_NOT_FINISHED');
 const rows=entries.filter(e=>e.kind==='tick');
 const result=analyzeTrace(rows,end.windows,end.at);
 if(process.argv[3]!==undefined){
  if(process.argv[3]!=='--exclude-windows'||!process.argv[4]||process.argv.length!==5)
   throw Error('USAGE_TRACE_OPTIONAL_EXCLUDE_WINDOWS_COMMA_SEPARATED_INDICES');
  result.gameplayPlanningOnly=auditPlanningSubset(rows,end.windows,end.at,process.argv[4].split(',').map(Number));
 }
 console.log(JSON.stringify(result,null,2));
}
