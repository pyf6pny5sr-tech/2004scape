# Twenty-minute live run: idle while the agent plans

**The character was visibly idle for 969 of 1,055 observed ticks overlapping actual agent/tool planning intervals (91.8%).** Estimated idle observation time was 384.8 seconds (6m 25s), out of 416.1 seconds of claimed planning/tool time. Of these idle ticks, 962 had no approved work; seven overlapped stationary recovery/controller pauses. A further 33 planning-overlap ticks were helper-ambiguous. This was not a low-idle result.

This tests **our controller with this Codex Cloud agent acting as Wartime's planner**, using its existing tools and reasoning. It does not test the separate inaccessible Wartime instance or isolate model inference time. No second provider/API key, nested inference, synthetic thinking delay, local emulator, public chat or PvP action was used.

## Fixed live window and source

- November 16, 2026, **19:20:51.980–19:40:51.981 UTC** (2:20:51.980–2:40:51.981 p.m. EST): **20:00.001** after preparation/readiness.
- Runtime source: [`6220c03`](https://github.com/pyf6pny5sr-tech/2004scape/commit/6220c0326beb90844e0b3e697c1fbc6a9b7db33d); SDK `3aa493c3d26680df5bae2b475cc1805e3db05ae3`; Node 24.22.1 / Bun 1.4.4.
- Online world `https://rs-sdk.maxbittker.com`, gateway `wss://rs-sdk.maxbittker.com/gateway`, using only the configured approved proxy with TLS/NO_PROXY preserved.
- Same previously validated private run/account; one owner, unchanged source/build, generation zero, zero new/replacement accounts. Owned controller/client stopped afterward.
- Full source hashes, sanitized per-minute data, timings and checks: [machine-readable report](long-run-report.json). Historical reports remain unchanged.

## Whole run versus claimed planning

| Mutually exclusive observation bucket | Whole run | Planning overlap |
|---|---:|---:|
| Visible no-approved-work idle | 1,098 | 962 |
| Stationary controller/failure-recovery pause | 869 | 7 |
| **Visible idle lower-bound estimate** | **1,967 / 3,000 (65.6%)** | **969 / 1,055 (91.8%)** |
| Pending helper/gather lease: possible additional idle | 450 | 33 |
| Actual observed movement/item/XP effect | 336 | 29 |
| Animation/combat evidence without proven progress | 180 | 12 |
| Required cooldown | 66 | 11 |
| Unknown first-boundary tick | 1 | 1 |
| Eligible walk queued without dispatch | 0 | 0 |
| Other unresolved queued eligibility | 0 | 0 |

The bold row is a subtotal, not an additional bucket. Whole-run visible idle corresponds to approximately **787.6 seconds (13m 8s)** of observed interval time. Longest consecutive visible-idle stretch: **221 ticks, approximately 88.36 seconds**. Within planning intervals the longest was **95 ticks / 37.68 seconds**. Physically stationary ticks were independently **2,766 / 3,000 (92.2%)**, including legitimate gathering animation and helper waits; stationary is not synonymous with idle.

There were 3,000 unique SDK tick buckets, 2,999 classifiable as known, **zero tick-number gaps, resets, invalid ticks or dropped trace writes**. Duplicate publication revisions were zero in this trace. Revisions within a tick were merged; real tick transitions, not polling iterations, form the denominator. One same-millisecond burst tick has zero elapsed weight but remains an observed tick. Observations covered 1,199.841 seconds; the initial unobserved 160 ms was not invented as idle. The first unknown tick covers another 448 ms.

“Visible idle” conservatively requires fresh stationary observations, no inventory/XP effect, no animation/combat evidence, no active owned helper/gather lease and no cooldown. Controller pauses are exposed separately, not called useful work or silently hidden as intentional downtime. No maintenance/safety pause was requested. Hidden server work remains unobservable, so this is an observation-based estimate, not an authoritative server-idleness trace. A pending SDK promise is never productivity evidence; a random skill attempt without XP is not automatically idle. Progress/busy evidence anywhere in a tick excludes that tick from the idle estimate.

The old narrow `avoidableIdleTicks` counter was **zero** despite the idle above. It is unsuitable as the answer to this question.

## Actual planning intervals

Each interval starts with explicit context/request claim and ends at approved proposal submission through the short bridge. This agent chose the next bounded plan from live state, skills, inventory and failures, rather than running one prewritten 20-minute action script. All 15 proposals were accepted. The host continued prior approved work where available. Request birth and unserved prefetch wait are separate from actual planning/tool time; 22 requests were observed, with 15 responses. An unserved request was not labeled “thinking.”

| Interval | Start–end (s) | Agent/tools (s) | Request lifetime (s) | Ticks | Visible idle | Ambiguous | Progress/busy |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 0.2–25.0 | 24.80 | 24.83 | 62 | 61 | 0 | 0 |
| 2 | 47.8–63.4 | 15.61 | 27.54 | 40 | 39 | 0 | 0 |
| 3 | 86.4–116.8 | 30.38 | 30.39 | 77 | 57 | 0 | 19 |
| 4 | 148.5–171.0 | 22.56 | 54.23 | 58 | 0 | 33 | 22 |
| 5 | 233.6–271.3 | 37.68 | 37.70 | 95 | 95 | 0 | 0 |
| 6 | 305.1–338.2 | 33.10 | 33.12 | 84 | 84 | 0 | 0 |
| 7 | 398.1–420.1 | 21.91 | 21.92 | 56 | 56 | 0 | 0 |
| 8 | 469.1–498.7 | 29.69 | 29.70 | 75 | 74 | 0 | 0 |
| 9 | 572.1–592.6 | 20.57 | 20.59 | 53 | 52 | 0 | 0 |
| 10 | 679.5–715.0 | 35.51 | 35.52 | 90 | 89 | 0 | 0 |
| 11 | 777.7–804.8 | 27.14 | 27.17 | 69 | 68 | 0 | 0 |
| 12 | 861.1–886.8 | 25.70 | 82.05 | 65 | 64 | 0 | 0 |
| 13 | 960.0–984.5 | 24.58 | 97.70 | 62 | 62 | 0 | 0 |
| 14 | 1041.4–1074.2 | 32.79 | 32.81 | 83 | 82 | 0 | 0 |
| 15 | 1136.4–1170.5 | 34.07 | 34.07 | 86 | 86 | 0 | 0 |

Planning rows count any tick with temporal overlap, once in the union. Seconds use the actual overlap of observation timestamp intervals. Tick-edge uncertainty remains; agent/tool turnaround includes retrieval, execution/tool scheduling and reasoning, **not isolated inference**. Per-window purposes and prefetch-only waits are in JSON.

All **783.888 seconds outside claimed planning** remain in whole-run totals and are not labeled model thinking. They include live monitoring, progress updates, scheduling and developer/evidence/report-support work. Offline analyzer/test authoring occurred in the unclaimed interval between planning windows 9 and 10 (592.634–679.531 seconds); that is a broad enclosing interval, not measured keystroke time. Private evidence-ledger/status-support edits also occurred outside claims. After the scope reminder, the remaining fixed window was used for gameplay servicing; report assembly followed the automatic end. No executor/collector behavior was changed during the baseline and nothing was reset or removed.

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
node wartime/v2/analyze-long-run.mjs /private/path/trace.jsonl > /private/path/sanitized-analysis.json
```

Use the same `--home` for a nondefault workspace. Placeholders above are contract illustrations, not literal valid steps. Do not claim during developer/report work, mark a pending prefetch as inference, insert thinking sleeps, or infer productivity from an unresolved helper. The public report contains aggregates/relative timelines only; raw account/state/chat/credential evidence stays private.

Validation: **63 Node tests + 3 focused Bun tests passed before the run** (overlapping suites), **two final offline-accounting tests passed**, and **12 live consistency/cleanup assertions passed**. Tests cover tick deduplication, resets/gaps, classification, overlapping claim windows, controller pauses and same-millisecond transitions. Runtime source is pinned above; the offline analyzer is delivered with this report and does not alter the measured runtime.
