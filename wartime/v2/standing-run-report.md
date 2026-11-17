# Standing-goal live follow-up

This is another explicitly disclosed fixed20-minute online iteration. It preserves the prior [reliability report](reliability-run-report.md) and private evidence unchanged. This cloud agent is the planner; no separate Wartime instance, second provider or isolated inference was tested.

Measured source **7181b7a69458d70e7d5df75ebb72b5d0f081f260**, SDK **3aa493c3d26680df5bae2b475cc1805e3db05ae3**, Node24.22.1/Bun1.4.4. World **https://rs-sdk.maxbittker.com**, same gateway and approved inherited proxy/TLS route. **2026-11-17T01:06:32.823Z–2026-11-17T01:26:32.828Z** (1200.005s); fixed target2026-11-17T01:26:32.823Z. Preparation excluded. [Sanitized JSON](standing-run-report.json); [preflight](standing-preflight.json).

## Idle, uncertainty and useful work

| Scope | Observed ticks | Visible idle | Idle % | Ambiguous | Progress /busy | Cooldown | Unknown |
|---|---:|---:|---:|---:|---:|---:|---:|
|Whole|3000|74|2.47|1131 (37.70%)|1060/403|331|1|
|All genuine claims|672|39|5.80|245 (36.46%)|227/89|72|0|
|Audited gameplay subset|672|39|5.80|245 (36.46%)|227/89|72|0|

Against immediate reliability: whole idle **15.30%→2.47%**, 12.833points /83.88% relative reduction. All-claim idle **188/624 (30.13%)→39/672 (5.80%)**, 24.325points /80.74% reduction. Negative improvement means worse.

The prior reliability audited subset80/514 (15.56%) excluded its entire mixed first claim. Current audit:{"reviewedAllWindows":true,"excludedWindowIndices":[],"notes":"All18 actual claim-to-accepted-completion windows serviced current live gameplay: fresh context, normal-tree selection, approval and intervening progress/status commentary where it occurred. Reasoning/tool/scheduling/status overhead remains included; not isolated inference. Root pin/code review occurred before timer start; its later progress-sync request was handled between claims. No developer/code/report/ledger authoring or runtime tuning occurred within the fixed window. Observation waits were outside completed claims. No rejected or declined proposal was removed; none occurred in this live window. All startup idle and unserved scheduling gaps remain in whole-run totals."}. Whole/all-claim totals retain every startup idle, failure, recovery, rejected/corrected proposal and unserved scheduling delay. No invented developer seconds or outcome-based exclusions.

Whole: visible-idle observed intervals29.489s; ambiguous456.471s; physically stationary2408ticks.

All genuine claims: visible-idle observed intervals15.473s; ambiguous97.067s; physically stationary543ticks.

Audited gameplay subset: visible-idle observed intervals15.473s; ambiguous97.067s; physically stationary543ticks.

Helpers completed **328**, versus245 reliability /187 continuity; **16.40/minute**. Continued-owned observed effect steps **0** are separate, not completed dispatch attempts. Failures **4/332 (1.205%)**, versus18/263 (6.844%) reliability and29/216 (13.426%) continuity. Absolute failure change-14; rate change-5.639points. 1 in flight at cutoff; later effects/stop cancellation excluded. Dispatch total333=helper completions+failed attempts+in-flight; passive effects excluded.

Verified episode action breakdown:{"counts":{"chop:verified":158,"burn_logs:verified":158,"walk:verified":12,"burn_logs:failed":2,"chop:failed":2},"missingEpisodes":0,"meaning":"Only episode events captured within exact boundary, joined to private persisted action outcomes. No raw state/name/chat or private path is published."}. Resource-only verified completions:316 (15.80/minute), separate from movement. In-flight helper age at cutoff:6634ms.

Routine-failure causes:{"FIRE_BLOCKED":2,"RESOURCE_DEPLETED":2}. Failed-counter/event distinction:{"failedAttemptCounter":4,"routineFailedEvents":4,"otherFailedOrInvalidatedHelperAttempts":0,"note":"Do not invent a category or successful outcome for a failed counter increment without routine_failed evidence. All failures remain in the completed-attempt rate."}. Helper-reported failures4; proven fresh-effect reconciliations0; bounded recoveries4; no-resource wait rounds0. These counts remain visible, never relabeled as successes. A depleted tree without required log/XP is still failure.

- Woodcutting:71→79, +98750 observed modified-server XP.
- Firemaking:78→85, +158000 observed modified-server XP.

Higher starting skills, random resource outcomes, routes, workload and shorter/different agent/tool scheduling are confounds. Prior reliability ambiguity1037/3000 (34.57%), observed progress968/3000; compare the current table rather than treating a pending helper as productivity. Prior continuity whole idle18.73%, all-claim35.91%; additional comparisons are in JSON. This is not an isolated causal benchmark.

## Long pauses and standing execution

| Scope | Previous ≥10s /≥30s /≥50s | Current ≥10s /≥30s /≥50s | Previous/current strict longest(s) |
|---|---:|---:|---:|
|Whole|3/2/1|1/0/0|107.541/28.809|
|All claims|2/1/0|1/0/0|43.195/15.473|

Unchanged historical whole streak:72ticks /28.809s, versus269ticks/107.541s reliability. Claims:39ticks /15.473s. Strict timelines clip claim gaps; historical overlap values are preserved separately in JSON.

The initial startup planning/status/tool interval is retained in every whole-run metric. Any further ≥10s pauses are listed below; no start/recovery period was removed. Standing execution:{"approvedGoals":1,"boundedChunksStarted":3,"continuationExpirations":0,"finalMode":"standing","maximumGeneratedAttemptsPerChunk":80,"perActionDeadlineStillEnforced":true,"totalChunksEntered":4,"chunkCounterMeaning":"boundedChunksStarted counts additional chunk transitions after initial chunk1."}. It executes an approved ordinary resource goal through bounded chunks, independent of a pending planner's wall clock; each action still has finite timeout, cooldown, proof checks and bounded backoff. It cannot invent new goals or wake an inactive chat. Manual stop/cancel, goal replacement and actual owner/connection/session failure revoke authority. No church/automatic HP/combat/region gameplay pauses. All ≥10s whole pauses:

| Relative start–end(s) | Ticks | Seconds |
|---:|---:|---:|
|0.555–29.364|72|28.809|

## Planning and latency

| Claim | Start–end(s) | Turnaround(s) | Request lifetime(s) | Ticks | Idle | Ambiguous | Progress/busy |
|---:|---:|---:|---:|---:|---:|---:|---:|
|1|13.891–29.632|15.741|755.071|40|39|0|0|
|2|90.605–107.789|17.184|78.162|45|0|13|27|
|3|153.925–165.243|11.318|54.681|29|0|10|16|
|4|215.794–227.686|11.892|62.236|30|0|9|18|
|5|285.822–299.417|13.595|70.804|35|0|13|18|
|6|349.977–367.982|18.005|66.982|46|0|26|17|
|7|415.387–430.027|14.640|60.252|37|0|15|17|
|8|504.397–518.409|14.012|86.209|36|0|18|15|
|9|566.500–584.514|18.014|65.084|46|0|18|22|
|10|639.665–655.028|15.363|70.033|40|0|13|23|
|11|704.040–717.599|13.559|60.517|35|0|12|18|
|12|769.586–785.274|15.688|65.483|40|0|16|20|
|13|835.107–850.626|15.519|65.171|39|0|16|19|
|14|901.891–916.695|14.804|64.856|38|0|15|18|
|15|966.290–979.275|12.985|62.242|33|0|14|15|
|16|1031.470–1045.811|14.341|66.448|37|0|11|22|
|17|1097.523–1113.484|15.961|66.478|41|0|17|18|
|18|1165.612–1175.235|9.623|59.793|25|0|9|13|

Proposals:{"submissions":18,"accepted":18,"rejected":0,"declined":0,"correctedAccepted":0,"rejections":[]}. Current claims end after successful validation/commit or explicit null decline. Rejected submissions remain inside the open claim through correction. Claim time includes reasoning/tools/scheduling/status commentary, not isolated inference. Reliability claims closed at submission before validation:15 claims,14 accepted; one claimed invalid submission plus one later unclaimed stale correction. Historical traces/reports unchanged. This claim-boundary improvement limits strict before/after equivalence when there are rejections. Automatic request lifetime can begin before the measured window; the prepared owner already had one request pending before root review. That preparation lifetime is not measured thinking or idle. All actual claim windows remain included. Requests born within window:{"n":17,"p50":65171,"p95":86209,"p99":86209,"min":54681,"max":86209}. Pending-at-cutoff:{"count":1,"oldestRequestAgeMs":22599,"notThinkingWithoutClaim":true}. An unserved prefetch is not proof a model was thinking. Observation waits are outside completed claims; status commentary within a claim remains included. No synthetic thinking sleeps, game tick changes or code/report/ledger authoring during gameplay claims.

| Metric | n | p50(ms) | p95(ms) |
|---|---:|---:|---:|
|actualClaimTurnaround|18|14640.000|18014.000|
|requestLifetime|18|65171.000|755071.000|
|tickCadenceMs|3000|400.364|480.380|
|tickJitterMs|3000|49.653|159.834|
|observationToDispatchMs|333|0.283|0.864|
|publicationAgeAtDispatchMs|333|32.000|40.000|
|dispatchAckMs|386|104.106|145.038|
|actionToEffectMs|328|2478.756|5615.414|

Dispatch measures API scheduling, not server execution; packet acknowledgement and observed effect latencies are distinct. Active helper promises are ambiguous. The classifier uses SDK publication tick transitions and deduplicates revisions; missing ticks are never invented as idle. Coverage:{"duplicates":0,"resets":0,"gappedTicks":0,"invalid":0,"droppedRows":0}. Collector overhead:{"callbacks":5137,"totalMs":393.1894680000405,"maxMs":12.429789999965578}. Exact covered intervals and unknown ticks are in JSON.

## Delivery and limits

The implementation preserves pending requests/work on malformed, stale, duplicate or full-queue proposals, and consumes requests only after validation/commit; explicit null declines. Fresh fire-location refusals prompt a checked alternate tile; short movement requires actual same-plane movement to an empty non-refused tile within stated tolerance. It cannot turn acknowledgement or unchanged position into proof. SDK cancellation/auth/transport/unexpected errors remain distinct.

Checks:15passed/0failed. Validation:{"preflight":"standing-preflight.json","node":{"passed":58,"failed":0},"bun":{"passed":91,"failed":0},"overlap":true,"reportOnlyPostRun":{"node":{"passed":3,"failed":0},"bun":{"passed":3,"failed":0},"note":"Reporting-only refinements after deadline/cleanup: correct inherited baseline wording, disclose pre-window request lifetime, join sanitized episode outcomes. Runtime remained unchanged."}}. Cleanup:{"stopped":true,"ownerProcessRunning":false,"ownedClientGone":true,"processIdentityChecked":true}. New/replacement accounts:0/0. Source pin versus final shipment:{"measuredRuntimeCommit":"7181b7a69458d70e7d5df75ebb72b5d0f081f260","finalRuntimeSameAsMeasured":true}. All runtime, capture/ledger/report tools and tests prepared and published before the measured window. Root preflight review occurs before timer start. Standing ordinary-resource goal is approved explicitly; no wall-clock renewal. Finite proposal/action deadlines, cooldowns and bounded retry/backoff chunks remain. Same owned account with higher skills; this cloud agent is planner through current tools. No second provider, synthetic thinking sleep, game-rate change or public chat. Keep startup idle and any unserved scheduling gaps; a helper promise is ambiguous, not productive evidence. The unchanged legacy no_approved_work_idle bucket describes no materialized active/queued routine, not absence of standing-goal authority; resource/backoff waits remain visible idle rather than being relabeled productive. Initial startup planning/status/tool overhead is retained. The original standing goal was approved once; later actual agent plans omit continuation to preserve it rather than renewing authority. After auto-cutoff, stop was requested and exact owned process identities were checked. No new/replacement account, no provider or public chat. The first automatic planner request was born during readiness before root review; its full755071ms lifetime includes preparation. All actual planning claims remain timed only inside the fixed window. Initial72-tick/28.809s visible-idle stretch includes actual start/tool/status/initial plan handling, not discarded preparation. No artificial >180s planner delay was inserted. Live evidence is one standing approval lasting the full session while genuine later plans omit continuation; the preflight virtual-clock test separately exercises181s of unserved planning. In-window request lifetimes and actual claim times are reported, not claimed as isolated inference. Compared with reliability, routes moved into a different normal-tree area and starting skills were higher; gains are observed before/after, not causally isolated controller improvements. Helper ambiguity rose by94ticks (3.13percentage points) while progress ticks rose968→1060; a helper promise remains unproven work.

One finite live session cannot establish zero hidden idle, unlimited autonomy, all transient failures eliminated, or performance of the separate Wartime runtime. Raw character/account/state/chat evidence stays private; published evidence hashes identify the retained private trace.
