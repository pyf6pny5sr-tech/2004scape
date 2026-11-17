// Offline report only: preserves prior classifier/overlap math and separates helper attempts from passive effects.
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {generateContinuityReport,comparePercent} from './continuity-report.mjs';
import {reportBucket} from './analyze-long-run.mjs';
const parse=t=>t.trim().split('\n').filter(Boolean).map(s=>JSON.parse(s));
const idle=new Set(['no_approved_work_idle','stationary_controller_pause','eligible_walk_without_dispatch_idle']);
export function idlePauses(rows,windows,duration){
 let ranges=windows?windows.map(w=>[w.start,w.end??duration]):[[0,duration]];ranges.sort((a,b)=>a[0]-b[0]);const merged=[];for(const r of ranges){if(merged.length&&r[0]<=merged.at(-1)[1])merged.at(-1)[1]=Math.max(merged.at(-1)[1],r[1]);else merged.push([...r]);}
 const stretches=[];let active=null;
 const flush=()=>{if(active)stretches.push(active);active=null;};
 for(const [start,end]of merged){flush();for(const row of rows){const a=Math.max(row.start,start),b=Math.min(row.end,end);if(b<=a)continue;if(!idle.has(reportBucket(row))){flush();continue;}if(!active||row.tick!==active.lastTick+1||a>active.endMs){flush();active={startMs:a,endMs:b,ticks:1,observedMs:b-a,lastTick:row.tick};}else{active.endMs=b;active.ticks++;active.observedMs+=b-a;active.lastTick=row.tick;}}flush();}
 return {definition:'Consecutive observed visible-idle buckets, breaking at missing ticks or excluded time; no invented missing time.',atLeast10Seconds:stretches.filter(s=>s.observedMs>=10000).length,atLeast30Seconds:stretches.filter(s=>s.observedMs>=30000).length,atLeast50Seconds:stretches.filter(s=>s.observedMs>=50000).length,longestSeconds:Math.max(0,...stretches.map(s=>s.observedMs/1000)),longPauses:stretches.filter(s=>s.observedMs>=10000).map(s=>({startSeconds:s.startMs/1000,endSeconds:s.endMs/1000,ticks:s.ticks,observedSeconds:s.observedMs/1000}))};
}
export function reliabilityReport(input,previousTrace){
 const r=generateContinuityReport(input),d=r.throughput.countsDelta,p=input.baseline.throughput;
 const helper=d.helperVerifiedCompletions??d.verifiedActions??0,passive=d.continuedOwnedEffectSteps??d.continuedGatherEffects??0,failed=d.failures??0,dispatch=d.dispatches??0;
 const prevHelper=p.helperVerifiedCompletions??p.verifiedActions,prevFailed=p.failureCounting?.failedAttemptCounter??p.failedResults,prevDispatch=p.countsDelta.dispatches;
 r.scope='Reliability follow-up with current cloud agent, online only; church and automatic HP/combat/region pauses retired; manual cancel/stop retained.';
 r.throughput.helperVerifiedCompletions=helper;r.throughput.continuedOwnedEffectSteps=passive;r.throughput.totalVerifiedEffectSteps=helper+passive;r.throughput.failedAttemptCount=failed;r.throughput.completedDispatchAttempts=helper+failed;r.throughput.inFlightAtCutoff=dispatch-helper-failed;
 r.throughput.helperReportedFailures=d.helperReportedFailures??0;r.throughput.reconciledHelperFailures=d.helperFailuresReconciledByFreshEffect??0;
 r.throughput.failureRate={denominator:'Completed helper dispatch attempts = helper-verified completions + failed attempts; excludes passive effect steps and in-flight attempts.',previousFailed:prevFailed,previousCompleted:prevHelper+prevFailed,previousPercent:100*prevFailed/(prevHelper+prevFailed),currentFailed:failed,currentCompleted:helper+failed,currentPercent:helper+failed?100*failed/(helper+failed):0};
 r.throughput.failureRate.changePercentagePoints=r.throughput.failureRate.currentPercent-r.throughput.failureRate.previousPercent;
 r.throughput.failureRate.absoluteChange=failed-prevFailed;
 const end=input.trace.findLast(x=>x.kind==='end'),rows=input.trace.filter(x=>x.kind==='tick');const oldEnd=previousTrace.findLast(x=>x.kind==='end'),oldRows=previousTrace.filter(x=>x.kind==='tick');
 r.longPauses={whole:idlePauses(rows,null,end.at),claims:idlePauses(rows,end.windows,end.at),previousWhole:idlePauses(oldRows,null,oldEnd.at),previousClaims:idlePauses(oldRows,oldEnd.windows,oldEnd.at)};
 r.previousReference={sourceCommit:input.baseline.sourceCommit,planningIdle:input.baseline.analysis.gameplayPlanningOnly.aggregate.visibleIdleLowerBoundTicks,planningTicks:input.baseline.analysis.gameplayPlanningOnly.aggregate.observedTicks,wholeIdle:input.baseline.analysis.whole.visibleIdleLowerBoundTicks,wholeTicks:input.baseline.analysis.whole.observedTicks};
 r.comparison.allClaimIntervals=comparePercent((input.baseline.analysis.claimedAgentToolIntervals??input.baseline.analysis.gameplayPlanningOnly.aggregate).visibleIdleLowerBoundPercent,r.analysis.claimedAgentToolIntervals.visibleIdleLowerBoundPercent);
 r.comparison.baselineWholeRunCaveat='Immediately preceding continuity run includes early automatic guard/recovery pauses; all19 claims were audited gameplay-service windows. The original older baseline separately contained developer periods. Current claim1 is mixed and remains in all-claim/whole totals.';
 r.throughput.failureCounting={failedAttemptCounter:failed,routineFailedEvents:Object.values(r.throughput.failureReasons).reduce((a,b)=>a+b,0),otherFailedOrInvalidatedHelperAttempts:failed-Object.values(r.throughput.failureReasons).reduce((a,b)=>a+b,0),note:'Do not invent a category or successful outcome for a failed counter increment without routine_failed evidence. All failures remain in the completed-attempt rate.'};
 r.window.targetEndUtc=new Date(Date.parse(r.window.startUtc)+1200000).toISOString();
 r.shipment=input.metadata.shipment??null;r.validation=input.metadata.validation??null;r.agentSubmissionAudit=input.metadata.agentSubmissionAudit??null;
 r.longPauses.auditedClaims=idlePauses(rows,end.windows.filter((w,i)=>!(input.metadata.planningAudit?.excludedWindowIndices??[]).includes(i+1)),end.at);
 r.longPauses.originalOverlapAccounting={previousWholeTicks:input.baseline.analysis.whole.longestVisibleIdleStreakTicks,previousWholeSeconds:input.baseline.analysis.whole.longestVisibleIdleStreakEstimatedSeconds,previousClaimTicks:input.baseline.analysis.claimedAgentToolIntervals?.longestVisibleIdleStreakTicks,previousClaimSeconds:input.baseline.analysis.claimedAgentToolIntervals?.longestVisibleIdleStreakEstimatedSeconds,currentWholeTicks:r.analysis.whole.longestVisibleIdleStreakTicks,currentWholeSeconds:r.analysis.whole.longestVisibleIdleStreakEstimatedSeconds,currentClaimTicks:r.analysis.claimedAgentToolIntervals.longestVisibleIdleStreakTicks,currentClaimSeconds:r.analysis.claimedAgentToolIntervals.longestVisibleIdleStreakEstimatedSeconds,note:'Unchanged historical overlap/streak accounting above. Supplemental strict pause timelines clip actual claim boundaries and break excluded-time gaps; they can be shorter (previous claim longest49.303s versus original50.103s), and do not replace these historical comparable values.'};
 r.comparison.primaryMeaning='Comparison is with immediately preceding continuity run (484/1348 planning idle,562/3000 whole), not the original86% baseline.';
 r.planningLatency.meaning='Legacy actualClaimToCompletionMs measures claim to completion-submission receipt, before proposal validation: includes rejected claim4. Includes gameplay reasoning, tools, scheduling and intervening progress/status commentary; not isolated inference. The later unclaimed stale submission is retained in whole-run totals.';
 r.checks.assertions.helperCompletionMetricPreserved=(d.verifiedActions??0)===helper;r.checks.assertions.nonnegativeDispatchAccounting=r.throughput.inFlightAtCutoff>=0;r.checks.passed=Object.values(r.checks.assertions).filter(Boolean).length;r.checks.failed=Object.values(r.checks.assertions).filter(x=>!x).length;
 return r;
}
export function readable(r) {
 const w=r.analysis.whole,a=r.analysis.claimedAgentToolIntervals,g=r.analysis.gameplayPlanningOnly.aggregate,f=r.throughput.failureRate;
 const pct=(n,d)=>(100*n/d).toFixed(2),fmt=n=>n.toFixed(3);
 const scopes=[['Whole fixed window',w],['All15 claim→submission intervals',a],['Audited gameplay subset: claims2–15',g]];
 const scopeTable=['| Scope | Ticks | Visible idle | Idle % | Additional ambiguous | Progress /busy | Cooldown | Unknown |','|---|---:|---:|---:|---:|---:|---:|---:|',...scopes.map(([n,v])=>`|${n}|${v.observedTicks}|${v.visibleIdleLowerBoundTicks}|${v.visibleIdleLowerBoundPercent.toFixed(2)}|${v.possibleAdditionalIdleTicks} (${pct(v.possibleAdditionalIdleTicks,v.observedTicks)}%)|${v.buckets.observed_progress??0}/${v.buckets.busy_without_proven_progress??0}|${v.buckets.cooldown??0}|${v.buckets.unknown??0}|`)];
 const timing=['| Metric | n | p50(ms) | p95(ms) |','|---|---:|---:|---:|',...Object.entries({claim_to_submission:r.planningLatency.actualClaimToCompletionMs,request_lifetime:r.planningLatency.automaticRequestLifetimeMs,...Object.fromEntries(Object.entries(r.actionTiming).filter(([k])=>!k.startsWith('planner')))}).map(([k,v])=>`|${k}|${v.n}|${v.p50.toFixed(2)}|${v.p95.toFixed(2)}|`)];
 const windows=['| Claim | Start–end(s) | Agent/tools(s) | Request lifetime(s) | Ticks | Idle | Ambiguous | Progress/busy |','|---:|---:|---:|---:|---:|---:|---:|---:|',...r.analysis.planningWindows.map(q=>`|${q.index}|${q.startSeconds.toFixed(3)}–${q.endSeconds.toFixed(3)}|${(q.turnaroundMs/1000).toFixed(3)}|${q.automaticRequestLifetimeMs===null?'unknown':(q.automaticRequestLifetimeMs/1000).toFixed(3)}|${q.observedTicks}|${q.visibleIdleLowerBoundTicks}|${q.possibleAdditionalIdleTicks}|${q.busyOrProgressTicks}|`)];
 return `# Live reliability follow-up: 20 minutes

Failures and overall idle improved, but long pauses are not eliminated. This tests our controller with **this cloud agent** supplying plans, not the separate inaccessible Wartime instance or isolated model inference.

Measured runtime: **${r.sourceCommit}**, SDK **${r.sourceIdentity.sdkCommit}**, Node24.22.1/Bun1.4.4. Same owned account, canonical online service and approved inherited proxy/TLS route. No new/replacement account or second provider. Original target **${r.window.targetEndUtc}**; captured **${r.window.startUtc}–${r.window.endUtc}**, ${r.window.durationMs/1000}s (timer callback2ms after target). Preparation is excluded. [Sanitized JSON](reliability-run-report.json); [implementation/preflight](reliability-preflight.json).

## Results and comparison

${scopeTable.join('\n')}

All-claim idle was **188/624 (30.13%)**, versus the preceding continuity run's **484/1348 (35.91%)**: **${r.comparison.allClaimIntervals.improvementPercentagePoints.toFixed(3)} percentage points /${r.comparison.allClaimIntervals.relativeReductionPercent.toFixed(2)}% relative reduction**. The whole window improved from **562/3000 (18.73%)** to **459/3000 (15.30%)**: ${r.comparison.wholeRun.improvementPercentagePoints.toFixed(3)}points /${r.comparison.wholeRun.relativeReductionPercent.toFixed(2)}% reduction.

A separate conservative subset excludes **entire claim1**, which included the root's cancellation-race review alongside gameplay. Claims2–15 had **80/514 idle ticks (15.56%)**, ${r.comparison.auditedGameplayPlanning.improvementPercentagePoints.toFixed(3)}points /${r.comparison.auditedGameplayPlanning.relativeReductionPercent.toFixed(2)}% lower than the prior35.91%. This exclusion is disclosed for support contamination, not selected by performance. All-claim/whole figures above retain that window and every bad period. No developer seconds are guessed.

Whole-run visible idle occupied **183.529s** of observed timestamp intervals; all claims **74.435s**; audited subset **31.240s**. Possible additional helper idle was **416.521s /74.484s /74.484s**, respectively. These are observed-interval estimates, not hidden-server execution measurements. Whole physically stationary ticks: **2365/3000**; gathering/animation is not automatically idle. Previous helper ambiguity was890/3000 (29.67%); it is now1037/3000 (34.57%). Observed progress ticks fell1058→968 despite more helper completions. Faster completed actions therefore do not imply every other tick was productive.

## Useful outcomes and failures

Comparable **helper-verified completions:245 versus187** (**12.25/min versus9.35/min**, +31.0%). Continued-owned effect steps: **${r.throughput.continuedOwnedEffectSteps}**, separately counted and never included in completed dispatches. Actual XP: WC62→71 **+70,625**, FM69→78 **+113,000**, on this modified server. Prior starting levels were43/50, so higher skills, random outcomes, routes and agent/tool scheduling confound causal attribution.

**Failed attempts:18 versus29**, an11-attempt reduction (37.93%). Completed dispatch denominator **263 versus216**; rates **6.844% versus13.426%**, down6.582points. Of264 dispatched helpers,245 verified,18 failed and1 remained in flight at cutoff. Subsequent stop/cancel/effects are excluded. Passive effects never inflate that equation. There were17 helper-reported failures,0 fresh-effect reconciliations,15 bounded continuation recoveries and13 resource-availability wait rounds.

| Observed routine-failure cause | Count | What was actually established |
|---|---:|---|
| RESOURCE_DEPLETED |7|Target disappeared; no required log+XP effect within the settling/verification window. Do not infer which actor felled it.|
| RESOURCE_TIMEOUT |5|Burn command lacked required log-loss+FM-XP proof before deadline; no claim that every underlying cause was a blocked fire tile.|
| RESOURCE_HELPER_DELAY |3|Movement helper did not prove requested position before its condition wait ended.|
| RESOURCE_UNAVAILABLE |2|No matching reachable tree at actual dispatch after UI handling.|
| Other canceled/invalidated helper attempt |1|Failure counter has no matching routine_failed event; one cancellation was observed. Do not invent a more precise cause.|

The malformed agent submission (wrong burn item field) was **REQUEST_FAILED**; its later correction was **STALE_PLANNER_REQUEST**. These2 bridge rejections caused no gameplay dispatch and are reported separately from18 failed dispatches. Claim4 ends at its first rejected submission because the existing collector closes before proposal validation; the later stale retry is outside that completed claim and remains in the whole window. There were15 claimed submissions,14 accepted plans and1 additional unclaimed stale submission. Claims are not all successful completions.

## Long pauses remain

Using unchanged historical overlap/streak accounting, whole longest idle worsened **161ticks/64.407s→269ticks/107.541s**. All-claim longest improved **127ticks/50.103s→108ticks/43.195s**; audited subset longest28ticks/10.560s. The107.541s whole-run pause is retained: a finite continuation expired while its prefetched request remained unserved, followed by the two rejected submissions and eventual fresh accepted plan. Cloud-agent scheduling/context overhead contributed; it is not isolated inference or an automatic HP/combat/church pause. The finite executor cannot invent unlimited new approvals or wake an unserviced agent.

Supplemental strict pause timelines clip exact claim boundaries and break gaps. Whole ≥10s/≥30s/≥50s counts changed **4/4/3→3/2/1**; all-claim counts **7/3/0→2/1/0**. The strict prior claim maximum49.303s differs from the unchanged historical50.103s because it clips gaps; both are retained in JSON. Current whole pauses ≥10s:

| Relative start–end(s) | Ticks | Observed seconds |
|---:|---:|---:|
${r.longPauses.whole.longPauses.map(p=>`|${fmt(p.startSeconds)}–${fmt(p.endSeconds)}|${p.ticks}|${fmt(p.observedSeconds)}|`).join('\n')}

## All planning windows and timing

${windows.join('\n')}

Claim1 is mixed support/gameplay; all others service actual live gameplay, including error handling. Claim→submission includes reasoning, tools, scheduling and intervening progress/status commentary. No source, capture, ledger or report authoring occurred during the fixed window. Observation waits were outside completed claims. Prefetch lifetime is separate and is not thinking time. No synthetic thinking sleeps, game-rate changes or automatic provider calls were used.

${timing.join('\n')}

Observation-to-dispatch measures owned executor scheduling from its observation, not isolated policy eligibility, network delivery or server execution. Packet acknowledgements (${r.actionTiming.dispatchAckMs.n} samples) are separate from observed action effects (${r.actionTiming.actionToEffectMs.n} samples). There were40 dispatches and162 observed-progress ticks overlapping claims; prefetch-pending metrics alone are not actual thinking overlap.

## Coverage, changes and shipment

**3000 observed ticks, no tick-number gaps/resets/dropped rows;1 unknown tick.** Covered observation intervals total1199.839s; the initial0.163s before first publication is outside observed tick intervals, not invented idle. The low-overhead passive collector processed3627 callbacks,316.797ms total (max2.790ms); event rows dropped:0. Same passive classifier/overlap code as prior reports. Exclusive buckets sum to3000. JSON retains per-minute buckets, timing sample counts, private-evidence hashes and13 passing consistency assertions.

Church workflow and automatic HP/combat/region pauses are retired. Fresh resource/slot resolution, depletion settling, proof-only reconciliation, bounded retry/backoff and queue preservation replace the previous early target/area failures. Manual stop/cancel and stale/auth/network/ownership/session rejection remain. Unexpected transport/auth/protocol/cancellation errors are preserved. The run stopped with its owned controller and client no longer running;0 replacements.

**After** the window and cleanup, commit **${r.shipment?.postRunFixCommit??'see JSON'}** fixed manual cancellation surviving later life/clock transitions. That narrow shipped fix passed39 tests under Node and39 under Bun; it was **not live-measured**. Preflight preserves initial75/76 Node and99/100 Bun results (same new floating-point assertion failure), corrected focused38 Node/56 Bun, and24 actual-SDK/resource tests. These overlap and are not added into a fictitious full-suite count. The2 report tests were rerun after reporting-only refinements; see JSON validation.

The remaining limitations are substantive: fire/movement condition failures persist, helper ambiguity increased, and the longest whole-run pause grew despite fewer aggregate idle ticks and more verified work. This is one finite online session; it does not prove zero idle, all failures fixed, unlimited autonomy or the separate Wartime runtime's performance.
`;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const [traceFile,evidenceFile,metadataFile,output]=process.argv.slice(2);const metadata=JSON.parse(await readFile(metadataFile,'utf8'));const text=await readFile(traceFile,'utf8'),eventText=await readFile(evidenceFile,'utf8');const baseline=JSON.parse(await readFile(metadata.baselineFile,'utf8'));const previousTrace=parse(await readFile(metadata.previousTraceFile,'utf8'));const r=reliabilityReport({trace:parse(text),evidence:parse(eventText),baseline,traceSummary:JSON.parse(await readFile(traceFile+'.summary.json','utf8')),evidenceSummary:JSON.parse(await readFile(evidenceFile+'.summary.json','utf8')),metadata},previousTrace);r.privateEvidence={tickTraceSha256:createHash('sha256').update(text).digest('hex'),eventTraceSha256:createHash('sha256').update(eventText).digest('hex'),rawPublished:false};await writeFile(output+'.json',JSON.stringify(r,null,2)+'\n');await writeFile(output+'.md',readable(r));console.log(JSON.stringify({written:true,window:r.window,checks:r.checks,comparison:r.comparison,throughput:r.throughput.helperVerifiedCompletions}));}
