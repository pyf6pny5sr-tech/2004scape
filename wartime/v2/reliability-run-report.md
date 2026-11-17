# Live reliability follow-up: 20 minutes

Failures and overall idle improved, but long pauses are not eliminated. This tests our controller with **this cloud agent** supplying plans, not the separate inaccessible Wartime instance or isolated model inference.

Measured runtime: **01e6ad76f3b6becd1eb432a90c3ac39e2c6c9ee7**, SDK **3aa493c3d26680df5bae2b475cc1805e3db05ae3**, Node24.22.1/Bun1.4.4. Same owned account, canonical online service and approved inherited proxy/TLS route. No new/replacement account or second provider. Original target **2026-11-17T00:14:00.001Z**; captured **2026-11-16T23:54:00.001Z–2026-11-17T00:14:00.003Z**, 1200.002s (timer callback2ms after target). Preparation is excluded. [Sanitized JSON](reliability-run-report.json); [implementation/preflight](reliability-preflight.json).

## Results and comparison

| Scope | Ticks | Visible idle | Idle % | Additional ambiguous | Progress /busy | Cooldown | Unknown |
|---|---:|---:|---:|---:|---:|---:|---:|
|Whole fixed window|3000|459|15.30|1037 (34.57%)|968/281|254|1|
|All15 claim→submission intervals|624|188|30.13|190 (30.45%)|162/44|39|1|
|Audited gameplay subset: claims2–15|514|80|15.56|190 (36.96%)|162/44|38|0|

All-claim idle was **188/624 (30.13%)**, versus the preceding continuity run's **484/1348 (35.91%)**: **5.777 percentage points /16.09% relative reduction**. The whole window improved from **562/3000 (18.73%)** to **459/3000 (15.30%)**: 3.433points /18.33% reduction.

A separate conservative subset excludes **entire claim1**, which included the root's cancellation-race review alongside gameplay. Claims2–15 had **80/514 idle ticks (15.56%)**, 20.341points /56.65% lower than the prior35.91%. This exclusion is disclosed for support contamination, not selected by performance. All-claim/whole figures above retain that window and every bad period. No developer seconds are guessed.

Whole-run visible idle occupied **183.529s** of observed timestamp intervals; all claims **74.435s**; audited subset **31.240s**. Possible additional helper idle was **416.521s /74.484s /74.484s**, respectively. These are observed-interval estimates, not hidden-server execution measurements. Whole physically stationary ticks: **2365/3000**; gathering/animation is not automatically idle. Previous helper ambiguity was890/3000 (29.67%); it is now1037/3000 (34.57%). Observed progress ticks fell1058→968 despite more helper completions. Faster completed actions therefore do not imply every other tick was productive.

## Useful outcomes and failures

Comparable **helper-verified completions:245 versus187** (**12.25/min versus9.35/min**, +31.0%). Continued-owned effect steps: **0**, separately counted and never included in completed dispatches. Actual XP: WC62→71 **+70,625**, FM69→78 **+113,000**, on this modified server. Prior starting levels were43/50, so higher skills, random outcomes, routes and agent/tool scheduling confound causal attribution.

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
|0.571–43.766|108|43.195|
|421.029–528.570|269|107.541|
|845.425–861.019|39|15.594|

## All planning windows and timing

| Claim | Start–end(s) | Agent/tools(s) | Request lifetime(s) | Ticks | Idle | Ambiguous | Progress/busy |
|---:|---:|---:|---:|---:|---:|---:|---:|
|1|0.194–43.775|43.581|43.612|110|108|0|0|
|2|103.743–129.205|25.462|85.429|65|0|14|45|
|3|216.813–250.950|34.137|113.156|86|1|32|47|
|4|471.730–482.290|10.560|231.340|28|28|0|0|
|5|519.872–528.465|8.593|45.818|22|22|0|0|
|6|581.519–596.976|15.457|68.510|40|1|38|0|
|7|651.932–661.422|9.490|56.990|24|11|6|6|
|8|714.554–727.092|12.538|65.670|33|0|9|20|
|9|774.957–787.763|12.806|59.571|33|0|24|8|
|10|833.379–844.089|10.710|49.691|28|17|4|6|
|11|891.344–902.115|10.771|58.026|28|0|15|10|
|12|949.638–962.367|12.729|58.176|33|0|13|15|
|13|1009.768–1023.304|13.536|59.430|35|0|13|18|
|14|1076.061–1088.022|11.961|63.337|31|0|13|15|
|15|1136.180–1147.290|11.110|56.293|28|0|9|16|

Claim1 is mixed support/gameplay; all others service actual live gameplay, including error handling. Claim→submission includes reasoning, tools, scheduling and intervening progress/status commentary. No source, capture, ledger or report authoring occurred during the fixed window. Observation waits were outside completed claims. Prefetch lifetime is separate and is not thinking time. No synthetic thinking sleeps, game-rate changes or automatic provider calls were used.

| Metric | n | p50(ms) | p95(ms) |
|---|---:|---:|---:|
|claim_to_submission|15|12538.00|43581.00|
|request_lifetime|15|59430.00|231340.00|
|tickCadenceMs|3000|400.74|475.86|
|tickJitterMs|3000|50.65|156.23|
|observationToDispatchMs|264|0.30|0.92|
|publicationAgeAtDispatchMs|264|27.00|33.00|
|dispatchAckMs|321|96.86|135.53|
|actionToEffectMs|245|2475.74|6456.61|

Observation-to-dispatch measures owned executor scheduling from its observation, not isolated policy eligibility, network delivery or server execution. Packet acknowledgements (321 samples) are separate from observed action effects (245 samples). There were40 dispatches and162 observed-progress ticks overlapping claims; prefetch-pending metrics alone are not actual thinking overlap.

## Coverage, changes and shipment

**3000 observed ticks, no tick-number gaps/resets/dropped rows;1 unknown tick.** Covered observation intervals total1199.839s; the initial0.163s before first publication is outside observed tick intervals, not invented idle. The low-overhead passive collector processed3627 callbacks,316.797ms total (max2.790ms); event rows dropped:0. Same passive classifier/overlap code as prior reports. Exclusive buckets sum to3000. JSON retains per-minute buckets, timing sample counts, private-evidence hashes and13 passing consistency assertions.

Church workflow and automatic HP/combat/region pauses are retired. Fresh resource/slot resolution, depletion settling, proof-only reconciliation, bounded retry/backoff and queue preservation replace the previous early target/area failures. Manual stop/cancel and stale/auth/network/ownership/session rejection remain. Unexpected transport/auth/protocol/cancellation errors are preserved. The run stopped with its owned controller and client no longer running;0 replacements.

**After** the window and cleanup, commit **695f6154b4794851d94f886c91ac4f9e2eca1ca5** fixed manual cancellation surviving later life/clock transitions. That narrow shipped fix passed39 tests under Node and39 under Bun; it was **not live-measured**. Preflight preserves initial75/76 Node and99/100 Bun results (same new floating-point assertion failure), corrected focused38 Node/56 Bun, and24 actual-SDK/resource tests. These overlap and are not added into a fictitious full-suite count. The2 report tests were rerun after reporting-only refinements; see JSON validation.

The remaining limitations are substantive: fire/movement condition failures persist, helper ambiguity increased, and the longest whole-run pause grew despite fewer aggregate idle ticks and more verified work. This is one finite online session; it does not prove zero idle, all failures fixed, unlimited autonomy or the separate Wartime runtime's performance.
