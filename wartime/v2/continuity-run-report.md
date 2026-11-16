# Live continuity follow-up: 20-minute idle comparison

**Visible idle during all 19 audited gameplay-service claim intervals fell from 86.48% to 35.91%: 50.57 percentage points, or 58.48% relative reduction.** Useful verified throughput rose from 3.10 to 9.35 actions/minute (62 → 187 actions per 20 minutes). This is an observed improvement with skill/workload/tool-turnaround confounds, not an isolated causal benchmark.

The runtime change adds a finite explicitly approved ordinary-resource reserve, proactive refill, fresh-effect reconciliation and bounded state-aware recovery. Each grant is limited to 40 generated actions/120 seconds, an approved area/resource recipe and supplied fire-placement alternatives. New plans yield at action boundaries; old active actions retain their original expiry/safety authority. No combat/chat/trade repetition or unlimited model loop is enabled. Implementation and tools were published before play as [0ad0cab](https://github.com/pyf6pny5sr-tech/2004scape/commit/0ad0cab).

This tests our controller with this cloud agent as planner, not the separate Wartime instance or isolated model inference. [Machine-readable results and source hashes](continuity-run-report.json).

Measured November 16, 2026, **3:27:50.441–3:47:50.443 p.m. EST**. UTC window: **2026-11-16T20:27:50.441Z–2026-11-16T20:47:50.443Z**, 1200.002 seconds after readiness. Pinned runtime: **0ad0cab7af4aa85be996642cbd8ad008d17fac5d**; SDK **3aa493c3d26680df5bae2b475cc1805e3db05ae3**. Same canonical online service and approved inherited proxy/TLS route.

| Scope | Observed ticks | Visible idle | Idle % | Additional ambiguous |
|---|---:|---:|---:|---:|
| Whole run | 3000 | 562 | 18.73% | 890 |
| All claim-to-completion intervals | 1348 | 484 | 35.91% | 315 |
| Audited gameplay-only subset | 1348 | 484 | 35.91% | 315 |

Compared with baseline audited **518/599 (86.477%)**, idle improved by **50.572 percentage points**, a **58.48% relative reduction**. Negative values mean worse idle.

Whole-run comparison: **46.833 percentage points** / **71.43% relative reduction** versus baseline 1,967/3,000 (65.567%). Baseline whole-run totals include developer/report periods; this comparison has that limitation.

Visible idle uses unchanged passive tick definitions: fresh stationary no-effect/no-animation/combat observations without a pending helper or cooldown; controller/recovery pauses are separate visible-idle buckets. A helper promise is ambiguous, not proof of work. Busy animation is evidence without proven progress. Missing ticks are not idle. Tick overlap counts any overlap once in the union; seconds use timestamp overlap. See sanitized JSON for all buckets, per-minute timeline, unknown/coverage and longest idle stretches.

## Useful work and failures

**187 verified actions (9.35/minute)**, 29 failed-attempt counter increments. There are 27 recorded routine-failure events (18 SDK_ACTION_FAILED, seven FRESH_RESOURCE_TARGET_NOT_FOUND, two ACTION_DEADLINE); two additional failed/canceled/invalidated helper attempts have no routine_failed event and are not given an invented category. Baseline had 62 verified (3.1/minute) and 10 durable failed results. At the exact cutoff, 217 dispatches = 187 verified + 29 failed attempts + one in flight; its later effect or stop cancellation is excluded. 72 helper dispatches occurred during actual claimed planning, and 373 planning-overlap ticks showed movement/item/XP effects. Dispatch alone is not server execution or productivity.

- Woodcutting: 43 → 62, +59375 observed modified-server XP.
- Firemaking: 50 → 69, +94000 observed modified-server XP.

The same character starts at higher skill levels than baseline. Adaptive targets, inventory decisions, random gathering and network timing differ. Lower idle is not sufficient if throughput falls or unresolved helper time rises; inspect jointAssessment and all buckets. No causal claim isolates controller changes from these differences.

## Bucket accounting, latency and remaining bottlenecks

| Same passive bucket | Baseline whole 20min | Follow-up whole 20min | Follow-up actual claims |
|---|---:|---:|---:|
| No approved work, visible idle | 1,098 |217 |208 |
| Stationary controller/recovery pause, visible idle |869 |345 |276 |
| Pending helper/lease, possible additional idle |450 |890 |315 |
| Observed movement/item/XP progress |336 |1,058 |373 |
| Animation/combat evidence, progress unproven |180 |291 |108 |
| Required cooldown |66 |198 |67 |
| Unknown first-boundary tick |1 |1 |1 |
| Eligible queued walk or other unresolved queued eligibility |0 |0 |0 |
| **Observed ticks** |**3,000** |**3,000** |**1,348** |

These rows are exclusive within each column. All 19 follow-up claims are retained, including three explicit declines/recovery intervals (**2,4,6**) and the first claim’s malformed local CLI invocation/retry. No developer/report/ledger authoring occurred during the fixed window. The review is the primary agent’s command-sequence audit; the independent evidence review verifies arithmetic/source/boundaries, not a separate full transcript profiler. Tool/scheduling/usage overhead remains; no seconds are guessed away.

The full claimed duration is **531.155 seconds** with approximately **191.634 seconds (3m11.6s)** visibly idle. The audited baseline had 235.586 claimed seconds and 205.335 estimated idle seconds. Whole-run visible idle is approximately **224.885 seconds (3m44.9s)** versus 787.550 baseline seconds. These are estimates from publication timestamp intervals, not synchronized server execution times.

The longest whole-run idle streak fell from 221 ticks/88.36s to **161 ticks/64.407s**; longest claim-overlap streak is **127 ticks/50.103s**, versus 86 ticks/34.067s in the narrower baseline subset. The early guard/recovery intervals were costly and were not removed. Physical stationary counts fell from 2,766/3,000 to **2,221/3,000**, but stationary gathering is not automatically idle.

**Ambiguity increased:** 315/1,348 claim-overlap ticks (**23.37%**) are pending-helper possible idle, versus 33/599 (**5.51%**) in the audited baseline. No unresolved helper is claimed productive. Actual 187 verified outcomes and +59,375 Woodcutting/+94,000 Firemaking XP demonstrate useful progress alongside that uncertainty. The raw failure count rose and is a remaining bottleneck; the change keeps many classified ordinary failures from stranding work rather than making all helpers reliable. There were 27 bounded recovery events and three explicit guarded-pause recoveries. Many fresh-effect discrepancies remain failures if original postconditions could not be proven at reconciliation time.

- **Real claim/tool turnaround:** n=19, p50 **28.107s**, p95/max **51.868s**. Baseline audited median was **24.583s**. This is not isolated inference and was not artificially delayed.
- **Automatic request lifetime:** n=19, p50 **63.062s**, p95 **87.849s**. The prefetch wait before a claim is not thinking.
- **Actual claim overlap activity:** **72 helper dispatches** and **373 progress ticks**, including movement/item/XP evidence. The broad 177 verified-actions-while-request-pending counter is a different scope and must not be substituted for actual thinking overlap.
- **Observed passive tick cadence:** n=2999, p50 **400ms**, p95 **481ms**, p99 **569ms**. Jitter n=2998, p50 **42ms**, p95 **195ms**. No tick-rate change.
- **Eligible observation to helper entry:** n=217, p50 **0.433ms**, p95 **2.687ms**. **Packet acknowledgement:** n=341, p50 **107.326ms**, p95 **170.694ms**. **Helper start to observed effect:** n=187, p50 **3,217.455ms**, p95 **8,455.706ms**. Dispatch/acknowledgement are not server execution.
- **Coverage:** zero tick-number gaps, resets, invalid ticks, duplicate revisions or dropped tick/evidence writes; 2,999 known buckets and one unknown. Initial 166ms is unobserved, not idle. Tick capture uses the same immutable classifier/overlap code as baseline.
- **Collector callback overhead:** 553.511ms across 3,476 callbacks, average **0.159ms**, max **16.339ms**, including inactive boundary callbacks. Private file writes are asynchronous/batched. Tool/status work and file I/O overhead are not isolated by that callback timer.

The account began at Woodcutting 43/Firemaking 50, rather than baseline 11/1. Later route familiarity, observed area approvals, random resource attempts, model/tool turnaround and servicing cadence also differ. The baseline whole run includes developer/support periods absent from this new window. Therefore the 50.57-point observed improvement must not be attributed entirely to the controller in isolation. The full early bad periods are retained, and no later zero-visible-idle slice is used as the headline result.

## Actual current-agent planning windows

| Window | Start–end (s) | Agent/tools (s) | Request lifetime (s) | Ticks | Idle | Ambiguous | Progress/busy |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 0.2–37.2 | 37.03 | 37.07 | 93 | 92 | 0 | 0 |
| 2 | 86.0–137.8 | 51.87 | 51.88 | 131 | 129 | 0 | 2 |
| 3 | 138.6–153.1 | 14.53 | 14.95 | 37 | 36 | 0 | 0 |
| 4 | 201.4–226.9 | 25.56 | 25.57 | 65 | 65 | 0 | 0 |
| 5 | 227.9–241.8 | 13.95 | 14.50 | 36 | 35 | 0 | 0 |
| 6 | 294.5–326.4 | 31.94 | 84.61 | 81 | 81 | 0 | 0 |
| 7 | 326.8–345.0 | 18.20 | 18.21 | 47 | 46 | 0 | 0 |
| 8 | 368.5–392.2 | 23.64 | 47.20 | 61 | 0 | 22 | 36 |
| 9 | 430.9–459.0 | 28.11 | 66.04 | 72 | 0 | 36 | 30 |
| 10 | 497.1–527.6 | 30.52 | 65.46 | 77 | 0 | 32 | 39 |
| 11 | 588.8–620.4 | 31.55 | 87.85 | 80 | 0 | 26 | 46 |
| 12 | 660.8–698.1 | 37.25 | 75.52 | 94 | 0 | 34 | 54 |
| 13 | 737.7–771.8 | 34.08 | 70.81 | 87 | 0 | 25 | 55 |
| 14 | 810.2–830.5 | 20.30 | 57.11 | 51 | 0 | 22 | 25 |
| 15 | 874.6–907.9 | 33.32 | 72.97 | 84 | 0 | 30 | 47 |
| 16 | 947.5–980.0 | 32.55 | 71.80 | 82 | 0 | 29 | 47 |
| 17 | 1018.4–1045.6 | 27.14 | 63.06 | 69 | 0 | 22 | 43 |
| 18 | 1084.0–1103.3 | 19.30 | 53.94 | 49 | 0 | 21 | 24 |
| 19 | 1146.6–1167.0 | 20.35 | 63.69 | 52 | 0 | 16 | 33 |

Claim-to-completion intervals include current-agent reasoning/retrieval/tools/scheduling and any intervening progress/status commentary, **not isolated inference**. Prefetch lifetime is separate. All 19 windows were reviewed against the primary agent’s command sequence and retained. They contain actual gameplay selection, finite-scope renewal or guarded recovery/decline. No development/report/ledger authoring was identified inside them. Window 1 includes a malformed local proposal invocation followed by a correct retry; it stays in the timing as gameplay-tool overhead. Windows 2, 4, 6 are declines, followed by explicit owned-state resumes outside claims. Progress/status commentary occurred inside some claims and remains included as gameplay-service/status overhead. Prepared observation waits occurred after claims completed; the watch tool refuses to wait while a claim is open. All 19 claims and every measured count remain unchanged. No exact developer durations were invented. Whole and all-claim counts retain all bad periods; exclude entire mixed windows only in a separately disclosed subset, never guessed developer seconds.

## Capture and limits

Private exact-boundary source, metrics, compact skill/inventory state and all executor events were captured in an opt-in passive stream prepared before the run. Baseline tick classifier/overlap code is unchanged. Raw account/state/chat/credential data is private. The owned client is absent and controller has exited (an unreaped zombie entry remained; it was not running). No new or replacement account was created.

Prepared boundary/source/coverage checks: **11 passed, 0 failed**. Additional exact arithmetic/source-preservation checks: **13 passed**. The private capture streams and report generator were prepared and pushed before measurement. The following are retained as limitations, not filtered periods:

- Early area guards caused two explicit recovery cycles; a no-reachable-target yield caused another. Later ordinary failures used 27 bounded recovery events.
- Area approvals were adapted to observed routes, and observation waits varied 20–45 seconds to service actual refill requests. Earlier coordinate-specific planning targets later gave way to same-name fresh dispatch selection.
- The account started at Woodcutting 43/Firemaking 50 versus baseline 11/1. The baseline whole run contains developer/support periods, and request servicing/tool turnaround also differs.
- The first malformed CLI invocation, all three declines, all failed attempts and the one in-flight cutoff action are accounted for without silently dropping time or assuming success.


This is a single finite 20-minute online session, not proof of unlimited autonomous model reasoning or PvP skill. Full sanitized counts, source hashes, distributions, audit, comparison arithmetic and limitations are in the adjacent JSON.

Reporting checks: **11 prepared boundary/coverage/audit checks and 13 additional arithmetic/source-preservation checks passed**. Preflight details (including the corrected asynchronous test fixture and focused reruns) are in [continuity-preflight.json](continuity-preflight.json). The final continuity file passed 16 tests on both Node and Bun; no broad test suite or live run was repeated after the successful relevant preflight checks. The runtime pin is unchanged.
