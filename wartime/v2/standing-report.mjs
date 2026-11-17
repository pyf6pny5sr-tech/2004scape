// Offline sanitized report: no gameplay, account provisioning, provider or classifier changes.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {reliabilityReport} from './reliability-report.mjs';
import {comparePercent} from './continuity-report.mjs';
const parse=t=>t.trim().split('\n').filter(Boolean).map(JSON.parse);
export function standingReport(input,previousTrace,continuity){
 const r=reliabilityReport(input,previousTrace),end=input.evidence.findLast(x=>x.kind==='end');
 const marks=input.evidence.filter(x=>x.at>=0&&x.at<=end.at&&x.kind.startsWith('completion_'));
 const rejected=new Set();let corrected=0;
 for(const m of marks){if(m.kind==='completion_rejected')rejected.add(m.id);if(m.kind==='completion_accepted'&&rejected.has(m.id))corrected++;}
 r.scope='Explicit standing ordinary-resource goal; this authorized cloud agent supplies live plans through existing tools, online only.';
 r.proposalAccounting={submissions:marks.filter(m=>m.kind==='completion_submission').length,accepted:marks.filter(m=>m.kind==='completion_accepted').length,rejected:marks.filter(m=>m.kind==='completion_rejected').length,declined:marks.filter(m=>m.kind==='completion_declined').length,correctedAccepted:corrected,rejections:marks.filter(m=>m.kind==='completion_rejected').map(m=>({atSeconds:m.at/1000,reason:m.reason}))};
 r.captureSemantics={ticks:'Unchanged passive tick classifier and overlap/streak definitions.',claims:'Current claims end after successful validation/commit or explicit null decline. Rejected submissions remain inside the open claim through correction. Claim time includes reasoning/tools/scheduling/status commentary, not isolated inference.',previous:'Reliability claims closed at submission before validation:15 claims,14 accepted; one claimed invalid submission plus one later unclaimed stale correction. Historical traces/reports unchanged. This claim-boundary improvement limits strict before/after equivalence when there are rejections.'};
 r.comparison.primaryMeaning='Immediate previous reliability run is primary; retain whole/all-claim and any separately audited subset. Prior continuity is an additional historical comparator.';
 r.comparison.priorContinuity={sourceCommit:continuity.sourceCommit,whole:comparePercent(continuity.analysis.whole.visibleIdleLowerBoundPercent,r.analysis.whole.visibleIdleLowerBoundPercent),allClaims:comparePercent(continuity.analysis.claimedAgentToolIntervals.visibleIdleLowerBoundPercent,r.analysis.claimedAgentToolIntervals.visibleIdleLowerBoundPercent),helperCompletions:continuity.throughput.verifiedActions,failedAttempts:continuity.throughput.failedResults};
 const births=new Map((input.evidence[0].pendingRequests??[]).map(x=>[x.id,x.requestedAt]));
 for(const x of input.evidence)if(x.kind==='event'&&x.event.type==='planner_requested')births.set(x.event.id,x.event.at);
 const done=new Set(input.evidence.filter(x=>x.kind==='event'&&x.event.type==='planner_response').map(x=>x.event.id));
 r.pendingAtCutoff={count:[...births].filter(([id])=>!done.has(id)).length,oldestRequestAgeMs:Math.max(0,...[...births].filter(([id])=>!done.has(id)).map(([,at])=>end.ended-at)),notThinkingWithoutClaim:true};
 r.standingExecution={approvedGoals:end.countsDelta.continuationApprovals??0,boundedChunksStarted:end.countsDelta.standingChunksStarted??0,continuationExpirations:end.countsDelta.continuationExpirations??0,finalMode:end.snapshot.continuation?.mode??null,maximumGeneratedAttemptsPerChunk:80,perActionDeadlineStillEnforced:true};
 r.validation=input.metadata.validation??null;
 return r;
}
export function readableStanding(r){
 const a=r.analysis,fmt=n=>Number(n).toFixed(3),pct=(n,d)=>(100*n/d).toFixed(2);
 const scopes=[['Whole',a.whole],['All genuine claims',a.claimedAgentToolIntervals],...(a.gameplayPlanningOnly?[['Audited gameplay subset',a.gameplayPlanningOnly.aggregate]]:[])];
 const counts=['| Scope | Observed ticks | Visible idle | Idle % | Ambiguous | Progress /busy | Cooldown | Unknown |','|---|---:|---:|---:|---:|---:|---:|---:|',...scopes.map(([n,v])=>`|${n}|${v.observedTicks}|${v.visibleIdleLowerBoundTicks}|${v.visibleIdleLowerBoundPercent.toFixed(2)}|${v.possibleAdditionalIdleTicks} (${pct(v.possibleAdditionalIdleTicks,v.observedTicks)}%)|${v.buckets.observed_progress??0}/${v.buckets.busy_without_proven_progress??0}|${v.buckets.cooldown??0}|${v.buckets.unknown??0}|`)];
 const plans=['| Claim | Start–end(s) | Turnaround(s) | Request lifetime(s) | Ticks | Idle | Ambiguous | Progress/busy |','|---:|---:|---:|---:|---:|---:|---:|---:|',...a.planningWindows.map(w=>`|${w.index}|${fmt(w.startSeconds)}–${fmt(w.endSeconds)}|${fmt(w.turnaroundMs/1000)}|${w.automaticRequestLifetimeMs===null?'unknown':fmt(w.automaticRequestLifetimeMs/1000)}|${w.observedTicks}|${w.visibleIdleLowerBoundTicks}|${w.possibleAdditionalIdleTicks}|${w.busyOrProgressTicks}|`)];
 const timing=['| Metric | n | p50(ms) | p95(ms) |','|---|---:|---:|---:|',...Object.entries({actualClaimTurnaround:r.planningLatency.actualClaimToCompletionMs,requestLifetime:r.planningLatency.automaticRequestLifetimeMs,...Object.fromEntries(Object.entries(r.actionTiming).filter(([k])=>!k.startsWith('planner')))}).map(([k,v])=>`|${k}|${v.n}|${fmt(v.p50)}|${fmt(v.p95)}|`)];
 const f=r.throughput.failureRate,c=r.comparison;
 return `# Standing-goal live follow-up

This is another explicitly disclosed fixed20-minute online iteration. It preserves the prior [reliability report](reliability-run-report.md) and private evidence unchanged. This cloud agent is the planner; no separate Wartime instance, second provider or isolated inference was tested.

Measured source **${r.sourceCommit}**, SDK **${r.sourceIdentity.sdkCommit}**, Node${r.environment.node}/Bun${r.environment.bun}. World **${r.environment.world}**, same gateway and approved inherited proxy/TLS route. **${r.window.startUtc}–${r.window.endUtc}** (${r.window.durationMs/1000}s); fixed target${r.window.targetEndUtc}. Preparation excluded. [Sanitized JSON](standing-run-report.json); [preflight](standing-preflight.json).

## Idle, uncertainty and useful work

${counts.join('\n')}

Against immediate reliability: whole idle **15.30%→${a.whole.visibleIdleLowerBoundPercent.toFixed(2)}%**, ${fmt(c.wholeRun.improvementPercentagePoints)}points /${c.wholeRun.relativeReductionPercent.toFixed(2)}% relative reduction. All-claim idle **188/624 (30.13%)→${a.claimedAgentToolIntervals.visibleIdleLowerBoundTicks}/${a.claimedAgentToolIntervals.observedTicks} (${a.claimedAgentToolIntervals.visibleIdleLowerBoundPercent.toFixed(2)}%)**, ${fmt(c.allClaimIntervals.improvementPercentagePoints)}points /${c.allClaimIntervals.relativeReductionPercent.toFixed(2)}% reduction. Negative improvement means worse.

The prior reliability audited subset80/514 (15.56%) excluded its entire mixed first claim. Current audit:${JSON.stringify(r.planningAudit)}. Whole/all-claim totals retain every startup idle, failure, recovery, rejected/corrected proposal and unserved scheduling delay. No invented developer seconds or outcome-based exclusions.

${scopes.map(([n,v])=>`${n}: visible-idle observed intervals${fmt(Object.entries(v.estimatedObservationIntervalSeconds).filter(([k])=>['no_approved_work_idle','stationary_controller_pause','eligible_walk_without_dispatch_idle'].includes(k)).reduce((s,[,n])=>s+n,0))}s; ambiguous${fmt(v.estimatedObservationIntervalSeconds.pending_helper_possible_idle??0)}s; physically stationary${v.physicallyStationaryTicks}ticks.`).join('\n\n')}

Helpers completed **${r.throughput.helperVerifiedCompletions}**, versus245 reliability /187 continuity; **${r.throughput.verifiedActionsPerMinute.toFixed(2)}/minute**. Continued-owned observed effect steps **${r.throughput.continuedOwnedEffectSteps}** are separate, not completed dispatch attempts. Failures **${f.currentFailed}/${f.currentCompleted} (${fmt(f.currentPercent)}%)**, versus18/263 (6.844%) reliability and29/216 (13.426%) continuity. Absolute failure change${f.absoluteChange}; rate change${fmt(f.changePercentagePoints)}points. ${r.throughput.inFlightAtCutoff} in flight at cutoff; later effects/stop cancellation excluded. Dispatch total${r.throughput.countsDelta.dispatches}=helper completions+failed attempts+in-flight; passive effects excluded.

Routine-failure causes:${JSON.stringify(r.throughput.failureReasons)}. Failed-counter/event distinction:${JSON.stringify(r.throughput.failureCounting)}. Helper-reported failures${r.throughput.helperReportedFailures}; proven fresh-effect reconciliations${r.throughput.reconciledHelperFailures}; bounded recoveries${r.throughput.countsDelta.boundedContinuationRecoveries??0}; no-resource wait rounds${r.throughput.countsDelta.resourceWaitRounds??0}. These counts remain visible, never relabeled as successes. A depleted tree without required log/XP is still failure.

${Object.entries(r.throughput.skillProgress).map(([name,s])=>`- ${name}:${s.startLevel}→${s.endLevel}, +${s.xpGain} observed modified-server XP.`).join('\n')}

Higher starting skills, random resource outcomes, routes, workload and shorter/different agent/tool scheduling are confounds. Prior reliability ambiguity1037/3000 (34.57%), observed progress968/3000; compare the current table rather than treating a pending helper as productivity. Prior continuity whole idle18.73%, all-claim35.91%; additional comparisons are in JSON. This is not an isolated causal benchmark.

## Long pauses and standing execution

| Scope | Previous ≥10s /≥30s /≥50s | Current ≥10s /≥30s /≥50s | Previous/current strict longest(s) |
|---|---:|---:|---:|
${[['Whole','whole','previousWhole'],['All claims','claims','previousClaims']].map(([n,x,y])=>`|${n}|${r.longPauses[y].atLeast10Seconds}/${r.longPauses[y].atLeast30Seconds}/${r.longPauses[y].atLeast50Seconds}|${r.longPauses[x].atLeast10Seconds}/${r.longPauses[x].atLeast30Seconds}/${r.longPauses[x].atLeast50Seconds}|${fmt(r.longPauses[y].longestSeconds)}/${fmt(r.longPauses[x].longestSeconds)}|`).join('\n')}

Unchanged historical whole streak:${a.whole.longestVisibleIdleStreakTicks}ticks /${fmt(a.whole.longestVisibleIdleStreakEstimatedSeconds)}s, versus269ticks/107.541s reliability. Claims:${a.claimedAgentToolIntervals.longestVisibleIdleStreakTicks}ticks /${fmt(a.claimedAgentToolIntervals.longestVisibleIdleStreakEstimatedSeconds)}s. Strict timelines clip claim gaps; historical overlap values are preserved separately in JSON.

Standing execution:${JSON.stringify(r.standingExecution)}. It executes an approved ordinary resource goal through bounded chunks, independent of a pending planner's wall clock; each action still has finite timeout, cooldown, proof checks and bounded backoff. It cannot invent new goals or wake an inactive chat. Manual stop/cancel, goal replacement and actual owner/connection/session failure revoke authority. No church/automatic HP/combat/region gameplay pauses. All ≥10s whole pauses:

${r.longPauses.whole.longPauses.length?'| Relative start–end(s) | Ticks | Seconds |\n|---:|---:|---:|\n'+r.longPauses.whole.longPauses.map(p=>`|${fmt(p.startSeconds)}–${fmt(p.endSeconds)}|${p.ticks}|${fmt(p.observedSeconds)}|`).join('\n'):'None observed.'}

## Planning and latency

${plans.join('\n')}

Proposals:${JSON.stringify(r.proposalAccounting)}. ${r.captureSemantics.claims} ${r.captureSemantics.previous} Pending-at-cutoff:${JSON.stringify(r.pendingAtCutoff)}. An unserved prefetch is not proof a model was thinking. Observation waits are outside completed claims; status commentary within a claim remains included. No synthetic thinking sleeps, game tick changes or code/report/ledger authoring during gameplay claims.

${timing.join('\n')}

Dispatch measures API scheduling, not server execution; packet acknowledgement and observed effect latencies are distinct. Active helper promises are ambiguous. The classifier uses SDK publication tick transitions and deduplicates revisions; missing ticks are never invented as idle. Coverage:${JSON.stringify(r.coverage)}. Collector overhead:${JSON.stringify(r.collectorOverhead)}. Exact covered intervals and unknown ticks are in JSON.

## Delivery and limits

The implementation preserves pending requests/work on malformed, stale, duplicate or full-queue proposals, and consumes requests only after validation/commit; explicit null declines. Fresh fire-location refusals prompt a checked alternate tile; short movement requires actual same-plane movement to an empty non-refused tile within stated tolerance. It cannot turn acknowledgement or unchanged position into proof. SDK cancellation/auth/transport/unexpected errors remain distinct.

Checks:${r.checks.passed}passed/${r.checks.failed}failed. Validation:${JSON.stringify(r.validation)}. Cleanup:${JSON.stringify(r.run.cleanup)}. New/replacement accounts:${r.run.newAccounts}/${r.run.replacements}. Source pin versus final shipment:${JSON.stringify(r.shipment)}. ${r.operatorNotes.join(' ')}

One finite live session cannot establish zero hidden idle, unlimited autonomy, all transient failures eliminated, or performance of the separate Wartime runtime. Raw character/account/state/chat evidence stays private; published evidence hashes identify the retained private trace.
`;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const [tf,ef,mf,out]=process.argv.slice(2),metadata=JSON.parse(await readFile(mf,'utf8')),tt=await readFile(tf,'utf8'),et=await readFile(ef,'utf8');const r=standingReport({trace:parse(tt),evidence:parse(et),baseline:JSON.parse(await readFile(metadata.baselineFile,'utf8')),traceSummary:JSON.parse(await readFile(tf+'.summary.json','utf8')),evidenceSummary:JSON.parse(await readFile(ef+'.summary.json','utf8')),metadata},parse(await readFile(metadata.previousTraceFile,'utf8')),JSON.parse(await readFile(metadata.continuityFile,'utf8')));r.privateEvidence={tickTraceSha256:createHash('sha256').update(tt).digest('hex'),eventTraceSha256:createHash('sha256').update(et).digest('hex'),rawPublished:false};await writeFile(out+'.json',JSON.stringify(r,null,2)+'\n');await writeFile(out+'.md',readableStanding(r));console.log(JSON.stringify({window:r.window,checks:r.checks,allClaims:r.comparison.allClaimIntervals,whole:r.comparison.wholeRun,helper:r.throughput.helperVerifiedCompletions,failures:r.throughput.failureRate,longest:r.longPauses.whole.longestSeconds}));}
