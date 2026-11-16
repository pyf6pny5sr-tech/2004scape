import test from 'node:test';import assert from 'node:assert/strict';import {analyzeTrace,reportBucket,auditPlanningSubset} from '../analyze-long-run.mjs';
test('offline accounting exposes failure pauses separately and merges overlapping thinking intervals',()=>{const rows=[{tick:1,start:0,end:400,fresh:true,intentional:true},{tick:2,start:400,end:800,fresh:true,active:true},{tick:3,start:800,end:1200,fresh:true,busy:true},{tick:4,start:1200,end:1600,fresh:true,progress:true,moved:true},{tick:7,start:1600,end:2000,fresh:true}];const a=analyzeTrace(rows,[{start:200,end:900},{start:800,end:1500}],2000);assert.equal(a.whole.visibleIdleLowerBoundTicks,2);assert.equal(a.whole.longestVisibleIdleStreakTicks,1);assert.equal(a.claimedAgentToolIntervals.observedTicks,4);assert.equal(a.claimedAgentToolIntervals.coveredObservationSeconds,1.3);assert.equal(a.whole.possibleAdditionalIdleTicks,1);assert.equal(a.whole.buckets.stationary_controller_pause,1);assert.ok(a.consistency.equalsObservedTicks);assert.equal(reportBucket({fresh:true,cooldown:true,intentional:true}),'cooldown');assert.equal(reportBucket({fresh:false,progress:true}),'unknown');});

test('zero millisecond burst transitions remain observed ticks, with zero elapsed weight',()=>{const a=analyzeTrace([{tick:1,start:0,end:0,fresh:true,active:true},{tick:2,start:0,end:400,fresh:true}],[{start:0,end:400}],400);assert.equal(a.whole.observedTicks,2);assert.equal(a.claimedAgentToolIntervals.observedTicks,2);assert.equal(a.whole.coveredObservationSeconds,.4);assert.equal(a.whole.possibleAdditionalIdleTicks,1);});


test('transcript audit excludes whole windows, preserves original indices and keeps all-claim baseline',()=>{
 const rows=[
  {tick:1,start:0,end:400,fresh:true},
  {tick:2,start:400,end:800,fresh:true,active:true},
  {tick:3,start:800,end:1200,fresh:true,progress:true},
  {tick:4,start:1200,end:1600,fresh:true},
 ];
 const windows=[{start:0,end:400},{start:400,end:1200},{start:1200,end:1600}];
 const original=analyzeTrace(rows,windows,1600);
 const audited=auditPlanningSubset(rows,windows,1600,[1,3]);
 assert.deepEqual(audited.includedWindowIndices,[2]);
 assert.deepEqual(audited.excludedWindowIndices,[1,3]);
 assert.equal(audited.windows[0].index,2);
 assert.equal(audited.claimedDurationMs,800);
 assert.equal(audited.aggregate.observedTicks,2);
 assert.equal(audited.aggregate.visibleIdleLowerBoundTicks,0);
 assert.equal(audited.aggregate.possibleAdditionalIdleTicks,1);
 assert.deepEqual(analyzeTrace(rows,windows,1600),original);
 assert.equal(original.claimedAgentToolIntervals.visibleIdleLowerBoundTicks,2);
 for(const indices of [[0],[4],[1,1],[1.5]])assert.throws(()=>auditPlanningSubset(rows,windows,1600,indices),/INVALID_AUDIT/);
 const overlapping=auditPlanningSubset(rows,[{start:0,end:800},{start:400,end:1200}],1600,[]);
 assert.equal(overlapping.claimedDurationMs,1200);
 assert.equal(overlapping.aggregate.observedTicks,3);
});
