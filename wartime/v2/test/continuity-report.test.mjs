import test from 'node:test';import assert from 'node:assert/strict';
import { generateContinuityReport, comparePercent, readableContinuityReport } from '../continuity-report.mjs';
function fixture(){
 const duration=1200000;
 const token={owner:'PRIVATE_OWNER',character:'PRIVATE_CHARACTER',world:'https://world.test',gateway:'wss://world.test/gateway',session:1,life:1};
 const identity={owner:'PRIVATE_OWNER',character:'PRIVATE_CHARACTER',runId:'r',world:token.world,gateway:token.gateway,implementation:{buildSha256:'actual',sdkCommit:'sdk'}};
 const snapshot={token,skills:[{name:'Woodcutting',level:43,experience:20000}],metrics:{counts:{}}};
 const trace=[{kind:'tick',tick:1,start:0,end:400,fresh:true},{kind:'tick',tick:2,start:400,end:800,fresh:true,progress:true},{kind:'tick',tick:3,start:800,end:1200,fresh:true,active:true},{kind:'end',at:duration,windows:[{id:'p',start:0,end:1200}]}];
 const evidence=[{kind:'begin',at:0,identity,snapshot,pendingRequests:[{id:'p',requestedAt:100000}]},{kind:'event',at:500,event:{at:100500,type:'dispatch',action:'chop'}},{kind:'event',at:600,event:{at:100600,type:'reserve_refill',character:'PRIVATE_CHARACTER',reason:'LOW_WATER',cyclesRemaining:2}},{kind:'end',at:duration,ended:duration+100000,identity,snapshot:{...snapshot,skills:[{name:'Woodcutting',level:44,experience:21000}]},countsDelta:{verifiedActions:80,failures:2},sampleDelta:{actionToEffectMs:[10,20]},droppedEvidenceRows:0}];
 const baseline={sourceCommit:'baseline',analysis:{gameplayPlanningOnly:{aggregate:{visibleIdleLowerBoundPercent:518/599*100},includedWindowIndices:[2],excludedWindowIndices:[1]},whole:{visibleIdleLowerBoundPercent:1967/3000*100}},throughput:{verifiedActionsPerMinute:3.1,failedResults:10},run:{runId:'r'}};
 return {trace,evidence,baseline,traceSummary:{coverage:{droppedRows:0,gappedTicks:0,resets:0}},metadata:{sourceCommit:'actual',planningAudit:{reviewedAllWindows:true,excludedWindowIndices:[]}}};
}
test('offline continuity comparison uses same classifier, exact boundaries and conservative audited subset',()=>{
 const f=fixture(),r=generateContinuityReport(f);
 assert.equal(r.analysis.whole.observedTicks,3);assert.equal(r.analysis.gameplayPlanningOnly.aggregate.visibleIdleLowerBoundTicks,1);
 assert.equal(r.throughput.verifiedActions,80);assert.equal(r.throughput.verifiedActionsPerMinute,4);
 assert.equal(r.throughput.dispatchesDuringPlanning,1);assert.equal(r.throughput.skillProgress.Woodcutting.xpGain,1000);
 assert.equal(r.analysis.planningWindows[0].automaticRequestLifetimeMs,1200);
 assert.equal(r.comparison.auditedGameplayPlanning.baselinePercent,518/599*100);
 assert.equal(r.comparison.auditedGameplayPlanning.followupPercent,100/3);
 assert.ok(r.comparison.auditedGameplayPlanning.improvementPercentagePoints>0);
 assert.equal(r.continuityEvents[0].character,undefined);
 const text=JSON.stringify(r);for(const sentinel of ['PRIVATE_OWNER','PRIVATE_CHARACTER'])assert.ok(!text.includes(sentinel));
 assert.ok(readableContinuityReport(r).includes('not the separate Wartime instance'));
 assert.equal(comparePercent(80,40).relativeReductionPercent,50);
});
test('pure gameplay subset requires explicit audit and mismatched boundary evidence fails closed',()=>{
 const f=fixture();delete f.metadata.planningAudit;const r=generateContinuityReport(f);
 assert.equal(r.analysis.gameplayPlanningOnly,undefined);assert.equal(r.comparison.auditedGameplayPlanning,null);
 assert.equal(r.checks.assertions.auditedAllClaims,false);
 f.evidence.at(-1).at--;assert.throws(()=>generateContinuityReport(f),/BOUNDARY_CAPTURE_MISMATCH/);
});
