// Offline sanitized comparison. Reads private capture files, never connects to the game.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { analyzeTrace, auditPlanningSubset, distribution } from './analyze-long-run.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const jsonLines=text=>text.trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));
const total=(object,keys)=>keys.reduce((sum,key)=>sum+(object[key]??0),0);
export function comparePercent(before,after) {
  return {baselinePercent:before,followupPercent:after,improvementPercentagePoints:before-after,relativeReductionPercent:before?100*(before-after)/before:null};
}
export function generateContinuityReport({ trace, evidence, baseline, traceSummary = null, evidenceSummary = null, metadata = {} }) {
  const boundary=trace.findLast(r=>r.kind==='end');
  const begin=evidence.find(r=>r.kind==='begin'),end=evidence.findLast(r=>r.kind==='end');
  if(!boundary||!begin||!end)throw Error('COMPLETE_BOUNDARY_CAPTURE_REQUIRED');
  if(boundary.at!==end.at)throw Error('BOUNDARY_CAPTURE_MISMATCH');
  const durationMs=boundary.at,started=end.ended-end.at;
  const rows=trace.filter(r=>r.kind==='tick');
  const analysis=analyzeTrace(rows,boundary.windows,durationMs);
  const events=evidence.filter(r=>r.kind==='event'&&r.at>=0&&r.at<=durationMs);
  const requests=new Map((begin.pendingRequests??[]).map(r=>[r.id,{requestedAt:r.requestedAt}]));
  for(const row of events)if(row.event.type==='planner_requested')requests.set(row.event.id,{requestedAt:row.event.at});
  for(let i=0;i<analysis.planningWindows.length;i++){
    const raw=boundary.windows[i],w=analysis.planningWindows[i],request=requests.get(raw.id);
    w.automaticRequestLifetimeMs=request?started+raw.end-request.requestedAt:null;
    w.unclaimedPrefetchMs=request?started+raw.start-request.requestedAt:null;
  }
  const audit=metadata.planningAudit??null;
  let gameplay=null;
  if(audit?.reviewedAllWindows===true){
    gameplay=auditPlanningSubset(rows,boundary.windows,durationMs,audit.excludedWindowIndices??[]);
    analysis.gameplayPlanningOnly=gameplay;
  }
  const before=baseline.analysis.gameplayPlanningOnly?.aggregate;
  if(!before)throw Error('AUDITED_BASELINE_REQUIRED');
  const after=gameplay?.aggregate??null;
  const counts=end.countsDelta;
  const verified=counts.verifiedActions??0,failures=counts.failures??0;
  const minutes=durationMs/60000,baselineRate=baseline.throughput.verifiedActionsPerMinute;
  const skillsBefore=Object.fromEntries(begin.snapshot.skills.map(s=>[s.name,s]));
  const skillsAfter=Object.fromEntries(end.snapshot.skills.map(s=>[s.name,s]));
  const skillProgress={};
  for(const name of ['Woodcutting','Firemaking'])if(skillsBefore[name]&&skillsAfter[name])skillProgress[name]={startLevel:skillsBefore[name].level,endLevel:skillsAfter[name].level,startXp:skillsBefore[name].experience,endXp:skillsAfter[name].experience,xpGain:skillsAfter[name].experience-skillsBefore[name].experience};
  const sameToken=['owner','character','world','gateway','session','life'].every(k=>begin.snapshot.token[k]===end.snapshot.token[k]);
  const lifetime=analysis.planningWindows.map(w=>w.automaticRequestLifetimeMs).filter(Number.isFinite);
  const claimed=analysis.planningWindows.map(w=>w.turnaroundMs);
  const inPlanning=at=>boundary.windows.some(w=>at>=w.start&&at<=(w.end??durationMs));
  const failureReasons={};
  for(const row of events)if(row.event.type==='routine_failed'){
    const raw=row.event.reason??'UNKNOWN';
    const label=/^[A-Z0-9_]+$/.test(raw)?raw:raw.startsWith('Target is not currently observed')?'TARGET_NOT_CURRENTLY_OBSERVED_OR_REACHABLE':'OTHER_GAMEPLAY_FAILURE';
    failureReasons[label]=(failureReasons[label]??0)+1;
  }
  const comparison={
    auditedGameplayPlanning:after?comparePercent(before.visibleIdleLowerBoundPercent,after.visibleIdleLowerBoundPercent):null,
    wholeRun:comparePercent(baseline.analysis.whole.visibleIdleLowerBoundPercent,analysis.whole.visibleIdleLowerBoundPercent),
    baselineAuditedWindowIndices:baseline.analysis.gameplayPlanningOnly.includedWindowIndices,
    baselineMixedWindowIndices:baseline.analysis.gameplayPlanningOnly.excludedWindowIndices,
    baselineWholeRunCaveat:'Original whole run includes developer/report-support and recovery time; it is less controlled than the transcript-audited gameplay subset.',
    verifiedActionsPerMinute:{baseline:baselineRate,followup:verified/minutes,difference:verified/minutes-baselineRate},
    baselineFailedResults:baseline.throughput.failedResults,followupFailedResults:failures,
    higherSkillAndWorkloadCaveat:'Same character has higher starting skill levels. Adaptive inventory/target decisions and random resource success differ; this is an observed before/after session, not a randomized isolated controller-speed experiment.',
  };
  const checks={
    exactTwentyMinuteTarget:durationMs>=1200000&&durationMs<=1200010,
    boundaryMetricsMatchPassiveEnd:boundary.at===end.at,
    exclusiveBucketSum:analysis.consistency.equalsObservedTicks,
    atLeastTenClaimWindows:boundary.windows.length>=10,
    noIncompleteClaims:boundary.windows.every(w=>!w.incomplete),
    sameOwnerCharacterWorldSessionLife:sameToken,
    sourceUnchangedDuringMeasurement:begin.identity.implementation.buildSha256===end.identity.implementation.buildSha256,
    noLostEvidenceRows:(evidenceSummary?.droppedEvidenceRows??end.droppedEvidenceRows??0)===0,
    noDroppedTickRows:traceSummary?.coverage?.droppedRows===0,
    noTickNumberGapsOrResets:traceSummary?.coverage?.gappedTicks===0&&traceSummary?.coverage?.resets===0,
    auditedAllClaims:audit?.reviewedAllWindows===true,
  };
  return {
    schemaVersion:1,
    scope:'Follow-up online continuity test with this cloud agent as planner; not the separate inaccessible Wartime runtime or isolated inference',
    sourceCommit:metadata.sourceCommit??null,
    sourceIdentity:begin.identity.implementation,
    baselineSourceCommit:baseline.sourceCommit,
    window:{startUtc:new Date(started).toISOString(),endUtc:new Date(end.ended).toISOString(),durationMs,preparationIncluded:false,fixedDeadline:true},
    environment:{world:begin.identity.world,gateway:begin.identity.gateway,node:metadata.node??null,bun:metadata.bun??null,location:'Authorized Codex Cloud; online only',route:'Existing inherited approved proxy/TLS/NO_PROXY route; no endpoint substitution'},
    run:{runId:begin.identity.runId,sameRecordedRunAsBaseline:begin.identity.runId===baseline.run.runId,ownerSha256:hash(String(begin.identity.owner)),ownerUnchangedWithinWindow:sameToken,newAccounts:metadata.newAccounts??null,replacements:metadata.replacements??null,cleanup:metadata.cleanup??null},
    measurement:{classifier:'Unchanged long-run.mjs flags and analyze-long-run.mjs reportBucket/overlap accounting',tickCountSource:'Passive owned SDK tick transitions, not polling iterations',rawStateChatCredentialsPublic:false,seconds:'Estimated from observed timestamp intervals; missing ticks are not idle; animation/helper evidence is not proven productivity'},
    analysis,
    coverage:traceSummary?.coverage??null,
    collectorOverhead:traceSummary?.overhead??null,
    eventCaptureCoverage:evidenceSummary??{droppedEvidenceRows:end.droppedEvidenceRows??null},
    planningAudit:audit,
    planningLatency:{actualClaimToCompletionMs:distribution(claimed),automaticRequestLifetimeMs:distribution(lifetime),unservedPrefetchIsThinking:false,meaning:'Actual current-agent reasoning/retrieval/tools/scheduling turnaround, not isolated model inference'},
    throughput:{verifiedActions:verified,verifiedActionsPerMinute:verified/minutes,failedResults:failures,countsDelta:counts,skillProgress,failureReasons,dispatchesDuringPlanning:events.filter(r=>r.event.type==='dispatch'&&inPlanning(r.at)).length,observedProgressTicksDuringPlanning:analysis.claimedAgentToolIntervals.buckets.observed_progress??0},
    actionTiming:Object.fromEntries(Object.entries(end.sampleDelta).map(([key,values])=>[key,distribution(values)])),
    continuityEvents:events.filter(r=>/continu|reserve|refill|recover|retry|yield/i.test(r.event.type)).map(r=>({atSeconds:r.at/1000,type:r.event.type,...Object.fromEntries(Object.entries(r.event).filter(([k,v])=>k!=='at'&&k!=='type'&&(typeof v==='number'||typeof v==='boolean'||(typeof v==='string'&&['reason','action','version','kind'].includes(k)&&/^[A-Z0-9_:-]{1,100}$/i.test(v)))))})),
    comparison,
    checks:{passed:Object.values(checks).filter(Boolean).length,failed:Object.values(checks).filter(v=>!v).length,assertions:checks},
    jointAssessment:{planningIdleReduced:comparison.auditedGameplayPlanning?comparison.auditedGameplayPlanning.improvementPercentagePoints>0:null,throughputNotLowerThanBaseline:verified/minutes>=baselineRate,actualSkillProgress:Object.values(skillProgress).some(s=>s.xpGain>0),note:'Lower idle alone does not establish success; inspect helper ambiguity, action rate, failures and actual progress. Skill/workload/network differences remain.'},
    operatorNotes:metadata.notes??[],
    limitations:['This cloud agent supplied plans with current tools; no second provider/API key or inaccessible Wartime identity was tested.','A standing tile, helper promise or no-XP tick alone does not establish idle/productivity. Hidden server work remains uncertain.','All-claim and whole-run measurements retain every failure, pause and mixed window; any gameplay-only audit excludes entire mixed windows, without invented developer durations.','Single character and 20-minute window do not prove unlimited autonomy, PvP ability or a causal timing result independent of higher skills/workload.'],
  };
}
export function readableContinuityReport(report){
 const w=report.analysis.whole,a=report.analysis.claimedAgentToolIntervals,g=report.analysis.gameplayPlanningOnly?.aggregate;
 const percent=n=>n.toFixed(2)+'%';
 const comparison=report.comparison.auditedGameplayPlanning;
 const table=['| Window | Start–end (s) | Agent/tools (s) | Request lifetime (s) | Ticks | Idle | Ambiguous | Progress/busy |','|---:|---:|---:|---:|---:|---:|---:|---:|'];
 for(const row of report.analysis.planningWindows)table.push(`| ${row.index} | ${row.startSeconds.toFixed(1)}–${row.endSeconds.toFixed(1)} | ${(row.turnaroundMs/1000).toFixed(2)} | ${row.automaticRequestLifetimeMs===null?'unknown':(row.automaticRequestLifetimeMs/1000).toFixed(2)} | ${row.observedTicks} | ${row.visibleIdleLowerBoundTicks} | ${row.possibleAdditionalIdleTicks} | ${row.busyOrProgressTicks} |`);
 return `# Live continuity follow-up:20-minute idle comparison\n\nThis tests our controller with this cloud agent as planner, not the separate Wartime instance or isolated model inference.\n\nMeasured window: **${report.window.startUtc}–${report.window.endUtc}**, ${(report.window.durationMs/1000).toFixed(3)} seconds after readiness. Pinned runtime: **${report.sourceCommit??'see computed source identity in JSON'}**; SDK **${report.sourceIdentity.sdkCommit}**. Same canonical online service and approved inherited proxy/TLS route.\n\n| Scope | Observed ticks | Visible idle | Idle % | Additional ambiguous |\n|---|---:|---:|---:|---:|\n| Whole run | ${w.observedTicks} | ${w.visibleIdleLowerBoundTicks} | ${percent(w.visibleIdleLowerBoundPercent)} | ${w.possibleAdditionalIdleTicks} |\n| All claim-to-completion intervals | ${a.observedTicks} | ${a.visibleIdleLowerBoundTicks} | ${percent(a.visibleIdleLowerBoundPercent)} | ${a.possibleAdditionalIdleTicks} |\n${g?`| Audited gameplay-only subset | ${g.observedTicks} | ${g.visibleIdleLowerBoundTicks} | ${percent(g.visibleIdleLowerBoundPercent)} | ${g.possibleAdditionalIdleTicks} |\n`:''}\n${comparison?`Compared with baseline audited **518/599 (86.477%)**, idle improved by **${comparison.improvementPercentagePoints.toFixed(3)} percentage points**, a **${comparison.relativeReductionPercent.toFixed(2)}% relative reduction**. Negative values mean worse idle.\n`:'Gameplay-only comparison remains pending explicit transcript audit; all claims are not automatically treated as pure gameplay thinking.\n'}\nWhole-run comparison: **${report.comparison.wholeRun.improvementPercentagePoints.toFixed(3)} percentage points** / **${report.comparison.wholeRun.relativeReductionPercent.toFixed(2)}% relative reduction** versus baseline 1,967/3,000 (65.567%). Baseline whole-run totals include developer/report periods; this comparison has that limitation.\n\nVisible idle uses unchanged passive tick definitions: fresh stationary no-effect/no-animation/combat observations without a pending helper or cooldown; controller/recovery pauses are separate visible-idle buckets. A helper promise is ambiguous, not proof of work. Busy animation is evidence without proven progress. Missing ticks are not idle. Tick overlap counts any overlap once in the union; seconds use timestamp overlap. See sanitized JSON for all buckets, per-minute timeline, unknown/coverage and longest idle stretches.\n\n## Useful work and failures\n\n**${report.throughput.verifiedActions} verified actions (${report.throughput.verifiedActionsPerMinute.toFixed(2)}/minute)**, ${report.throughput.failedResults} failed results. Baseline: 62 verified (3.1/minute), 10 failed results. ${report.throughput.dispatchesDuringPlanning} helper dispatches occurred during actual claimed planning, and ${report.throughput.observedProgressTicksDuringPlanning} planning-overlap ticks showed movement/item/XP effects. Dispatch alone is not server execution or productivity.\n\n${Object.entries(report.throughput.skillProgress).map(([name,s])=>`- ${name}: ${s.startLevel} → ${s.endLevel}, +${s.xpGain} observed modified-server XP.`).join('\n')}\n\nThe same character starts at higher skill levels than baseline. Adaptive targets, inventory decisions, random gathering and network timing differ. Lower idle is not sufficient if throughput falls or unresolved helper time rises; inspect jointAssessment and all buckets. No causal claim isolates controller changes from these differences.\n\n## Actual current-agent planning windows\n\n${table.join('\n')}\n\nClaims measure current-agent reasoning/retrieval/tools/scheduling, **not isolated inference**. Prefetch lifetime is separate. No developer/report authoring should occur inside these claims. Audit: ${report.planningAudit?JSON.stringify(report.planningAudit):'not yet provided; no pure-gameplay subset claimed'}. Whole and all-claim counts retain all bad periods; exclude entire mixed windows only in a separately disclosed subset, never guessed developer seconds.\n\n## Capture and limits\n\nPrivate exact-boundary source, metrics, compact skill/inventory state and all executor events were captured in an opt-in passive stream prepared before the run. Baseline tick classifier/overlap code is unchanged. Raw account/state/chat/credential data is private. Cleanup: ${JSON.stringify(report.run.cleanup)}. New/replacement accounts: ${report.run.newAccounts}/${report.run.replacements}.\n\nChecks: ${report.checks.passed} passed, ${report.checks.failed} failed. ${report.operatorNotes.join(' ')}\n\nThis is a single finite 20-minute online session, not proof of unlimited autonomous model reasoning or PvP skill. Full sanitized counts, source hashes, distributions, audit, comparison arithmetic and limitations are in the adjacent JSON.\n`;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [traceFile,evidenceFile,metadataFile,outputPrefix]=process.argv.slice(2);if(!outputPrefix)throw Error('USAGE_TRACE_EVIDENCE_METADATA_OUTPUT_PREFIX');
 const traceText=await readFile(traceFile,'utf8'),evidenceText=await readFile(evidenceFile,'utf8');
 const metadata=JSON.parse(await readFile(metadataFile,'utf8'));
 const baselineFile=metadata.baselineFile??path.join(path.dirname(new URL(import.meta.url).pathname),'long-run-report.json');
 const baseline=JSON.parse(await readFile(baselineFile,'utf8'));
 const traceSummary=JSON.parse(await readFile(traceFile+'.summary.json','utf8'));
 const evidenceSummary=JSON.parse(await readFile(evidenceFile+'.summary.json','utf8'));
 const report=generateContinuityReport({trace:jsonLines(traceText),evidence:jsonLines(evidenceText),baseline,traceSummary,evidenceSummary,metadata});
 report.privateEvidence={tickTraceSha256:hash(traceText),eventEvidenceSha256:hash(evidenceText),rawEvidencePublished:false};
 await writeFile(outputPrefix+'.json',JSON.stringify(report,null,2)+'\n');await writeFile(outputPrefix+'.md',readableContinuityReport(report));
 console.log(JSON.stringify({written:true,window:report.window,checks:report.checks,gameplayComparison:report.comparison.auditedGameplayPlanning,wholeComparison:report.comparison.wholeRun}));
}
