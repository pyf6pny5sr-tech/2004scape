# Twenty-minute live run: idle while the agent plans

**Audit correction:** the original publication incorrectly said all ledger/event-support work was outside claims. Some claim windows mixed gameplay planning with development/report support. The fixed 20-minute trace and original whole-run/all-claim figures are unchanged; no new live run was performed.

**Conservative gameplay-planning-only subset: 518 visibly idle ticks out of 599 (86.5%), plus 33 ambiguous ticks**, across retained windows **2, 3, 4, 6, 7, 9, 13, 14 and 15**. Their total claimed agent/tool time is **235.586 seconds**, with approximately **205.335 seconds (3m 25s)** of visible idle.

The original **969/1,055 ticks (91.8%)** remains the result for **all 15 claim-to-completion agent/tool intervals, including mixed development/report-support work**. Its approximately **384.8 seconds** of idle out of **416.113 seconds** is not a pure gameplay-thinking or inference measurement. Both scopes include tool/scheduling overhead and show substantial idle.

This tests **our controller with this Codex Cloud agent acting as Wartime's planner**, using its existing tools and reasoning. It does not test the separate inaccessible Wartime instance or isolate model inference time. No second provider/API key, nested inference, synthetic thinking delay, local emulator, public chat or PvP action was used.

## Fixed live window and source

- November 16, 2026, **19:20:51.980–19:40:51.981 UTC** (2:20:51.980–2:40:51.981 p.m. EST): **20:00.001** after preparation/readiness.
- Runtime source: [`6220c03`](https://github.com/pyf6pny5sr-tech/2004scape/commit/6220c0326beb90844e0b3e697c1fbc6a9b7db33d); SDK `3aa493c3d26680df5bae2b475cc1805e3db05ae3`; Node 24.22.1 / Bun 1.4.4.
- Online world `https://rs-sdk.maxbittker.com`, gateway `wss://rs-sdk.maxbittker.com/gateway`, using only the configured approved proxy with TLS/NO_PROXY preserved.
- Same previously validated private run/account; one owner, unchanged source/build, generation zero, zero new/replacement accounts. Owned controller/client stopped afterward.
- Full source hashes, sanitized per-minute data, timings and checks: [machine-readable report](long-run-report.json). Historical reports remain unchanged.

## Whole run, all claims and audited gameplay subset

| Mutually exclusive observation bucket | Whole run | All claims (mixed) | Audited gameplay subset |
|---|---:|---:|---:|
| Visible no-approved-work idle | 1,098 | 962 | 515 |
| Stationary controller/failure-recovery pause | 869 | 7 | 3 |
| **Visible idle lower-bound estimate** | **1,967 / 3,000 (65.6%)** | **969 / 1,055 (91.8%)** | **518 / 599 (86.5%)** |
| Pending helper/gather lease: possible additional idle | 450 | 33 | 33 |
| Actual observed movement/item/XP effect | 336 | 29 | 29 |
| Animation/combat evidence without proven progress | 180 | 12 | 12 |
| Required cooldown | 66 | 11 | 7 |
| Unknown first-boundary tick | 1 | 1 | 0 |
| Eligible walk queued without dispatch | 0 | 0 | 0 |
| Other unresolved queued eligibility | 0 | 0 | 0 |

The bold row is a subtotal, not an additional bucket. Whole-run visible idle corresponds to approximately **787.6 seconds (13m 8s)** of observed interval time. Longest consecutive visible-idle stretch: **221 ticks, approximately 88.36 seconds**. Across all claims the longest was **95 ticks / 37.68 seconds**; in the audited gameplay subset it was **86 ticks / 34.067 seconds**. Physically stationary ticks were independently **2,766 / 3,000 (92.2%)**, including legitimate gathering animation and helper waits; stationary is not synonymous with idle. The audited subset has **576 physically stationary ticks / 599**. Its 33 ambiguous ticks cover approximately **12.596 seconds**; observed progress covers **11.272 seconds**, busy-unproven evidence **4.803 seconds**, and cooldowns **1.580 seconds**. These sum with the idle estimate to the subset’s **235.586 seconds**.

There were 3,000 unique SDK tick buckets, 2,999 classifiable as known, **zero tick-number gaps, resets, invalid ticks or dropped trace writes**. Duplicate publication revisions were zero in this trace. Revisions within a tick were merged; real tick transitions, not polling iterations, form the denominator. One same-millisecond burst tick has zero elapsed weight but remains an observed tick. Observations covered 1,199.841 seconds; the initial unobserved 160 ms was not invented as idle. The first unknown tick covers another 448 ms.

“Visible idle” conservatively requires fresh stationary observations, no inventory/XP effect, no animation/combat evidence, no active owned helper/gather lease and no cooldown. Controller pauses are exposed separately, not called useful work or silently hidden as intentional downtime. No maintenance/safety pause was requested. Hidden server work remains unobservable, so this is an observation-based estimate, not an authoritative server-idleness trace. A pending SDK promise is never productivity evidence; a random skill attempt without XP is not automatically idle. Progress/busy evidence anywhere in a tick excludes that tick from the idle estimate.

The old narrow `avoidableIdleTicks` counter was **zero** despite the idle above. It is unsuitable as the answer to this question.

## All claim-to-completion intervals (including mixed work)

Each interval starts with explicit context/request claim and ends at approved proposal submission through the short bridge. A claim marks a measurement boundary, not proof that everything inside it is gameplay reasoning; six windows contain known or conservatively identified development/report-methodology work. This agent chose the next bounded plan from live state, skills, inventory and failures, rather than running one prewritten 20-minute action script. All 15 proposals were accepted. The host continued prior approved work where available. Request birth and unserved prefetch wait are separate from claim-to-completion time; 22 requests were observed, with 15 responses. An unserved request was not labeled “thinking.”

| Interval | Start–end (s) | Agent/tools (s) | Request lifetime (s) | Ticks | Visible idle | Ambiguous | Progress/busy | Audit classification |
|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 1 | 0.2–25.0 | 24.80 | 24.83 | 62 | 61 | 0 | 0 | Mixed — excluded |
| 2 | 47.8–63.4 | 15.61 | 27.54 | 40 | 39 | 0 | 0 | Gameplay — retained |
| 3 | 86.4–116.8 | 30.38 | 30.39 | 77 | 57 | 0 | 19 | Gameplay — retained |
| 4 | 148.5–171.0 | 22.56 | 54.23 | 58 | 0 | 33 | 22 | Gameplay — retained |
| 5 | 233.6–271.3 | 37.68 | 37.70 | 95 | 95 | 0 | 0 | Mixed — excluded |
| 6 | 305.1–338.2 | 33.10 | 33.12 | 84 | 84 | 0 | 0 | Gameplay — retained |
| 7 | 398.1–420.1 | 21.91 | 21.92 | 56 | 56 | 0 | 0 | Gameplay — retained |
| 8 | 469.1–498.7 | 29.69 | 29.70 | 75 | 74 | 0 | 0 | Mixed — excluded |
| 9 | 572.1–592.6 | 20.57 | 20.59 | 53 | 52 | 0 | 0 | Gameplay — retained |
| 10 | 679.5–715.0 | 35.51 | 35.52 | 90 | 89 | 0 | 0 | Mixed — excluded |
| 11 | 777.7–804.8 | 27.14 | 27.17 | 69 | 68 | 0 | 0 | Mixed — excluded |
| 12 | 861.1–886.8 | 25.70 | 82.05 | 65 | 64 | 0 | 0 | Mixed — excluded |
| 13 | 960.0–984.5 | 24.58 | 97.70 | 62 | 62 | 0 | 0 | Gameplay — retained |
| 14 | 1041.4–1074.2 | 32.79 | 32.81 | 83 | 82 | 0 | 0 | Gameplay — retained |
| 15 | 1136.4–1170.5 | 34.07 | 34.07 | 86 | 86 | 0 | 0 | Gameplay — retained |

All-claim and subset rows count any tick with temporal overlap, once in the union. Seconds use the actual overlap of observation timestamp intervals. Tick-edge uncertainty remains; agent/tool turnaround includes retrieval, execution/tool scheduling and reasoning, **not isolated inference**. Per-window purposes and prefetch-only waits are in JSON.

### Transcript audit and correction

We reviewed **all 15 windows**, not just the four initially questioned. Exclude entire windows **1, 5, 8, 10, 11 and 12**; retain **2, 3, 4, 6, 7, 9, 13, 14 and 15**. Exclusion is based on the activity sequence, not idle percentages, success or failure. The subset was then recomputed from the same private tick trace with the same bucket/overlap definitions.

| Window | Decision | Transcript/activity evidence |
|---:|---|---|
| 1 | Exclude entire window | Authored long-complete.mjs between claim and completion; helper construction is development/support work. |
| 2 | Retain | Live inventory/target assessment and bounded gathering/burning continuation; no support-code/report work identified. |
| 3 | Retain | Read controller/SDK chop and target-resolution semantics to understand an actual live chop failure and choose the next gameplay plan. Retained as action-specific gameplay reasoning, not measurement/report work. |
| 4 | Retain | Assessed active progression and prefetched bounded continuation; no support-code/report work identified. |
| 5 | Exclude entire window | Measurement-classifier/report-methodology review occurred during the claim; conservatively exclude the entire window even without a support-code edit. |
| 6 | Retain | Chose inventory management and gathering/navigation steps. The long-watch.mjs formatting edit followed the awaited completion command in the same sequential shell command, so was outside this window. |
| 7 | Retain | Assessed actual route failure, inventory and observed tree targets before replanning; no measurement/report work identified. |
| 8 | Exclude entire window | Inspected request fields and edited long-claim.mjs to append the private claim ledger before completion. |
| 9 | Retain | Assessed observed skills/inventory and chose nearby oak gathering. Offline analyzer/test authoring occurred after this window completed, before window 10. |
| 10 | Exclude entire window | Start/end timestamp reporting and correction plus process/tool-return diagnosis (Date conversion, ps, output-file size and private run-status checks) occurred while the claim was open. |
| 11 | Exclude entire window | Checked retained event-ledger request births before completion; this is evidence/report-support work. |
| 12 | Exclude entire window | Edited long-watch.mjs to retain long-all-events.jsonl and inspected recordRoutine/episode evidence before completion. |
| 13 | Retain | Ordinary bounded gather/burn continuation from live progression/inventory; no support-code/report work identified. |
| 14 | Retain | Ordinary recovery/inventory/target planning after a live action failure; no support-code/report work identified. |
| 15 | Retain | Chose a short route to a previously reached region and bounded inventory/gathering work; no support-code/report work identified. |

Exact developer durations were **not instrumented**. The six excluded windows have a combined **180.527 seconds of claim time**, which includes gameplay work too; that is **not** a measurement of time spent developing or reporting. We exclude whole windows conservatively rather than guess seconds to subtract. The nine retained windows still include game-related retrieval, action-semantics inspection (window 3), tool execution and scheduling overhead. No other measurement/report-support activity was identified in those windows by the transcript audit; this is not an independent per-task profiler or an isolated inference benchmark.

All **783.888 seconds outside claims** remain in whole-run totals. They include live monitoring, progress updates, scheduling and developer/evidence support. However, support work also occurred **inside** the mixed claims above; the previous statement that private ledger/event-support edits were all outside claims was false. Offline analyzer/test authoring itself occurred in the unclaimed interval between windows 9 and 10 (**592.634–679.531 seconds**), a broad enclosing interval rather than measured keystroke time. Final report assembly followed the fixed end. No executor/collector behavior was changed during the baseline, no trace was reset, and no failed or idle period was removed from whole-run or all-claim results.

For the narrower gameplay-planning question, use the **518/599 audited subset**, alongside its conservative exclusions and overhead limits. Preserve **969/1,055** for all claims, explicitly mixed, and **1,967/3,000** for the entire run. None is evidence about the separate Wartime runtime.


## Progression, failures and timings

- **62 verified actions:** 27 gathers, 33 burns, two movements; **3.1 verified actions/minute**. Durable episode results place them inside the window; last durable episode completed at 1,195.401 seconds, before the deadline.
- **15 durable routines:** five fully verified, ten requiring re-planning, with ten failed action results. Failure categories: `{'SDK_ACTION_FAILED': 8, 'TARGET_NOT_CURRENTLY_OBSERVED_OR_REACHABLE': 1, 'ACTION_DEADLINE': 1}`. Failures and their recovery pauses are retained.
- Woodcutting **11 → 43**, **+19,687 XP**; Firemaking **1 → 50**, **+33,500 XP**. These are observed modified-server units, not historical revision-274 rates. Inventory was managed with burning. Plans adapted to observed targets, surplus logs, route failures and available oak as ordinary progression; this was not a controlled before/after workload optimization.
- Some gathering effects occurred even when the helper outcome failed verification. XP progression and verified action counts are intentionally separate.
- Measured tick cadence: **p50 401 ms, p95 473 ms, p99 549 ms**, n=2,999 intervals; client-publication jitter p50 41 ms / p95 173 ms, n=2,998. Bursty arrival and millisecond clock quantization do not prove server phase changes; tick rate was not modified.
- Observation-to-eligible-helper dispatch: **p50 0.44 ms, p95 288.62 ms**, n=72. Packet acknowledgement: **p50 98.57 ms, p95 165.01 ms**, n=264. Helper-to-observed effect: **p50 3,280.38 ms, p95 10,461.11 ms**, n=62. Dispatch and acknowledgement are not server execution.
- Passive collector callbacks totaled **419.10 ms** across 3,257 calls (including inactive boundary callbacks), averaging **0.129 ms**, max **7.164 ms**. Writes were private asynchronous batches of 64 with a bounded write backlog. Low-rate observation tools were used; tick capture did not depend on full-state polling.

The 20-minute test confirms real online progression and persistent execution across current-agent planning calls. It also shows substantial starvation, recovery overhead and helper ambiguity. It does **not** establish low-idle or unlimited autonomy, nor represent the performance of the separate Wartime runtime. No gameplay optimization was applied during this baseline.

## Reproduce the measurement

Use the already-owned stopped run and explicit online configuration; do not create another account just to attach measurement. Privately set `measurementFile` to a new absolute private filename, then prepare/resume through `agent.mjs ensure` and verify `context` identity/readiness. The optional collector does not change action scheduling.

```sh
node wartime/v2/agent.mjs tool '{"operation":"measurement_begin","durationMs":1200000}'
node wartime/v2/agent.mjs context
# Select a valid current pending request, then claim immediately before real reasoning/tools:
node wartime/v2/agent.mjs tool '{"operation":"measurement_claim","id":"REQUEST_ID"}'
# Reason using current observations/knowledge, then submit approved typed steps:
node wartime/v2/agent.mjs complete REQUEST_ID '{"steps":[APPROVED_TYPED_STEPS]}'
node wartime/v2/agent.mjs tool '{"operation":"measurement_status"}'
# The fixed timer closes automatically; stop the owned run after capture.
node wartime/v2/agent.mjs tool '{"operation":"stop"}'
node wartime/v2/analyze-long-run.mjs /private/path/trace.jsonl \
  --exclude-windows 1,5,8,10,11,12 > /private/path/sanitized-analysis.json
```

Use the same `--home` for a nondefault workspace. Placeholders above are contract illustrations, not literal valid steps. For future measurements, do not claim during developer/report work. For this historical run the six mixed windows remain in all-claim totals and are excluded only in the separate audited subset. Do not mark a pending prefetch as inference, insert thinking sleeps, or infer productivity from an unresolved helper. The exclusion indices above are specific to this transcript audit, not a general filter for other runs. The public report contains aggregates/relative timelines only; raw account/state/chat/credential evidence stays private.

Validation: **63 Node tests + 3 focused Bun tests passed before the run** (overlapping suites), **two final offline-accounting tests passed**, and **12 live consistency/cleanup assertions passed**. Tests cover tick deduplication, resets/gaps, classification, overlapping claim windows, controller pauses and same-millisecond transitions. Runtime source is pinned above; the offline analyzer does not alter the measured runtime. This reporting correction passed **three focused offline-accounting tests**, including whole-window exclusion/index preservation, union-duration accounting, invalid indices and preservation of the original baseline. The raw trace hash and whole/all-claim aggregates were checked against publication `8aeb249` and remain unchanged.

Audit arithmetic/preservation checks: **13 passed** against the captured trace and original publication, including window partition, bucket/duration sums, per-minute/whole/all-claim preservation and unchanged private trace hash. No new live play or runtime change was performed.
