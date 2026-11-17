# Wartime v2: persistent single-owner controller

Start here for the new implementation. v1 and its historical report remain unchanged. V2 runs ordinary approved routines in one long-lived Bun process while the frontier model thinks through short private bridge calls. It does not select a model, call a paid provider automatically, train weights, or run upstream Minecraft Voyager. No separate sanitized controller ZIP was supplied or inspected; compatibility with Wartime's existing controller must be checked in its own runtime.

**Current contract:** church maintenance and automatic HP/combat/region gameplay pauses are retired at the user's request. Manual `cancel`/`stop` remain authoritative; stale/disconnected/auth/ownership state still cannot dispatch. Historical maintenance and prior live reports below preserve what those older versions exercised, not current requirements. No church detour or staged in-game policy update is part of startup or play.

## Latest standing-goal live validation

The [new fixed20-minute online report](standing-run-report.md) measured **7181b7a** on the same owned account, with18 actual agent/tool planning intervals and the resource goal approved only once. Whole visible idle fell **459/3000 (15.30%)→74/3000 (2.47%)**, an **83.88% relative reduction**. All-claim idle fell **188/624 (30.13%)→39/672 (5.80%)**; all18 current claims are gameplay service, with no filtered window. The longest visible-idle stretch fell **107.541s→28.809s**, entirely at measured startup; no ≥30s or ≥50s visible-idle pause occurred.

Verified helpers rose **245→328** (158 chops,158 burns,12 moves); failed completed attempts fell **18/263 (6.84%)→4/332 (1.20%)**. Two fire-location refusals and two depleted trees remain failures. Helper ambiguity **increased34.57%→37.70%**; it is not proof of productivity. Higher skills, different routes and current-agent/tool scheduling confound causality. [JSON](standing-run-report.json) retains every tick/claim, actual timing, initial idle, unknown coverage, action denominators and exact source identity. Owned processes stopped; no new/replacement account or second provider.

This is the new standard agent path: explicitly approve `continuation.mode:"standing"` once; it continues checked bounded chunks without a model renewal timer. Correctable rejected proposals keep their request and work; claims close on actual acceptance/explicit null decline. The older reliability report used submission-before-validation closure, so comparisons disclose that difference. Preflight passed58 Node/91 Bun checks; post-run reporting-only checks passed3 each. The shipped runtime is unchanged from measured7181b7a.

## Historical reliability follow-up

The [new fixed20-minute online report](reliability-run-report.md) measured runtime **01e6ad7**: **245 helper-verified completions** versus187; failed dispatches **18/263 (6.84%)** versus29/216 (13.43%). Whole-run visible idle fell **18.73%→15.30%**; all15 actual claim-to-submission intervals fell **35.91%→30.13%**. The separate audited subset excludes entire mixed support/gameplay claim1: **80/514 (15.56%)**, with every claim retained in the all-claim/whole totals.

Long pauses remain: whole longest idle worsened **64.407s→107.541s** while a finite grant expired and a prefetched request went unserved, followed by rejected agent submissions. Helper ambiguity increased **29.67%→34.57%**. These results are this cloud agent's reasoning/tools/scheduling, with higher starting skills, not isolated inference or the inaccessible Wartime runtime. See [sanitized counts, timing, audit and source identity](reliability-run-report.json). The post-window **695f615** manual-cancel life/clock fix passed39 tests each under Node and Bun and was not live-measured. Owned processes stopped; no replacement/new account.

## Historical live continuity follow-up

The [new fixed 20-minute online report](continuity-run-report.md) tests pinned implementation 0ad0cab on the same account: actual game-service planning idle **484/1,348 ticks (35.91%)**, compared with audited baseline **518/599 (86.48%)**—**50.57 percentage points / 58.48% relative reduction**. Verified throughput rose **62 → 187 actions**; 29 failed-attempt counter increments and 315 ambiguous planning ticks remain. Higher starting skills, workload/tool timing and baseline developer periods limit causal comparison. See [sanitized JSON](continuity-run-report.json), including all 19 intervals, early guard pauses, source identity, cleanup and failure-count distinctions. This measured this cloud agent, not the separate Wartime runtime or isolated inference.

## Approved resource goal while the current agent plans

You are already the planner. For an ordinary woodcutting/Firemaking goal, use a short proposal plus an explicitly approved standing resource goal. Do not reset goals just to refill; service an existing pending request while work continues. No second provider/key or nested login is needed.

```js
{
  steps: [{action:"chop", target:{name:"Tree"}, expect:[
    {type:"inventory_gain",item:{name:"Logs"},amount:1},
    {type:"xp_gain",skill:"Woodcutting",amount:1}
  ]}],
  continuation: {
    recipe:"woodcut_firemake", mode:"standing", target:{name:"Tree"}, log:{name:"Logs"},
    maxActions:80
  }
}
```

This is the standard current-agent path. Approve this existing ordinary-resource goal once: `mode:"standing"` executes checked chunks of at most80 generated attempts, then starts another chunk for the same goal. It has **no wall-clock renewal deadline**; a slow/unserved planner does not end already-approved work. Each action retains its own finite deadline, fresh-state/owner/generation checks, cooldown and bounded backoff. Only Tree/Logs or Oak/Oak logs tasks are accepted; it never invents a new goal or automatically repeats combat/chat/trade.

`continuation.mode`, current chunk, remaining chunk attempts and failures are visible in status. New plan proposals still expire within120seconds; their expiry is separate from standing-goal authority. A valid ordinary-resource proposal omitting `continuation` preserves a standing goal. Explicit `continuation:null`, manual cancel/stop or a changed goal revokes it. Real connection/ownership/session failure invalidates it; life/clock transitions invalidate old callbacks, and a canceled goal cannot revive. Optional legacy `mode:"bounded"` retains its finite80-attempt/180-second grant; this is not the default play-loop recommendation. No gameplay-risk toggles or church detours exist.

Planner completion validates everything synchronously **before consuming the request or changing work**. On `BURN_ITEM_SELECTOR_REQUIRED`, `STALE_PLAN`, `DUPLICATE_PROPOSAL`, `BOUNDED_QUEUE_REQUIRED` or another actionable rejection, inspect/correct the proposal using the **same pending request ID**. No rejected input discards the active routine, queue, standing goal or dedup slot. A successful correction consumes it exactly once; explicit `null` declines it without changing approved work. A supplied stale token is rejected, not silently replaced. Example: burn uses `item:{name:"Logs"}`, not `log`. Do not reset the goal just to correct a proposal.

Resource targets are freshly resolved after UI handling, at dispatch. A remembered coordinate is a preference; `target.exact:true` with explicit x/z is available when a real exact target is intended. Actual dispatched target/plane anchors the gathering lease. Tree disappearance gets three observed ticks for late log/XP publication; a short read-only reconciliation can prove original effects after an ambiguous helper outcome. No effect means failure, never fake success or verified learning.

Ordinary failures preserve independent approved queued work and the approved resource goal. Target/depletion waits use bounded tick backoff (2,4,8 ticks), reselect live alternatives, and do not clear useful work or demand a model resume. Failed attempts consume bounded chunk budget; standing execution starts the next chunk without a model renewal. Unavailable targets/full inventory wait on fresh observations with backoff and send no fake actions. Full inventory uses approved burnable logs if available; unavailable work waits without no-op packets. Fresh fire-location refusal messages use the pinned SDK observation/tick cursor and trigger alternate placement without waiting for a full timeout. Fire placement uses current empty neighboring tiles or optional explicit `fireTiles` preferences, only when needed for that resource task. Short relocation sends one SDK walk, then requires fresh movement on the same plane to a currently empty tile within one tile of the selected destination; unchanged/occupied/refused tiles never prove success. Automatic combat/chat/trade or unrelated goals are never generated.

HP/combat changes and walking outside an old region do not cancel the goal. Death/life changes invalidate old action callbacks and plan tokens; the still-approved resource goal can be regenerated from fresh respawn state. Invalid/stale/unknown owner/session state cannot dispatch or reconnect into a takeover fight. Unexpected/auth/network/protocol errors are preserved, not called resource timeouts. `cancel` is a deliberate manual hold until a new approved goal/resume; `stop` shuts down the owned run/client.

The capture CLI [continuity-capture.mjs](continuity-capture.mjs) is prepared before play: `init/begin/context/claim/complete/watch/stop`, private `--directory`, existing run `--home`. A claim stays open through rejected submissions/corrections until an accepted proposal or explicit null decline. Historical reports ended claims at submission before validation; keep this distinction when comparing. Claims include reasoning/tools/scheduling/status commentary, not isolated inference. Observation waits are outside open claims. The unchanged passive classifier and overlap math are used by [reliability-report.mjs](reliability-report.mjs) to compare against the previous continuity run, including failures/rates, ambiguity and long idle stretches. No code/report/ledger authoring belongs inside a timed gameplay claim.

## Twenty-minute online idle baseline

The [audit-corrected long-run report](long-run-report.md) preserves **969/1,055 idle ticks (91.8%) across all 15 claim-to-completion intervals, including mixed development/report support**. A separate conservative gameplay-planning-only subset excludes entire windows 1,5,8,10,11,12: **518/599 idle ticks (86.5%)**, with 33 ambiguous ticks, across nine retained windows. Whole-run idle and the raw trace are unchanged. Exact developer durations were not measured; tool/scheduling overhead remains in both scopes. This is this cloud agent/controller, not the separate Wartime instance or isolated inference. See the audit and [sanitized JSON](long-run-report.json); do not use `avoidableIdleTicks=0` as a real idle result.

## Default agent-first online setup

**You are Wartime. You are already the planner.** Use your current execution/tools to prepare and control this runtime. Do not look for `OPENAI_API_KEY`, launch nested Codex inference, sign into another model, copy model credentials, migrate auth, or configure billing. The reported read-only Codex sign-in is irrelevant to this default mode; do not try to repair or bypass it.

From this repository on your authorized cloud/agent host:

```sh
node wartime/v2/agent.mjs ensure \
  --world https://rs-sdk.maxbittker.com \
  --gateway wss://rs-sdk.maxbittker.com/gateway
```

Use an already-available Bun 1.4+ and Node 24+. If Bun is not on PATH, set `BUN_EXECUTABLE` to its existing executable path. Missing runtimes are reported; this command does not install system software or configure paid services.

The command prepares a private pinned RS-SDK checkout, installs its SDK/client project dependencies, obtains the pinned historical knowledge library, writes private online world configuration with no character/password, and starts or resumes one persistent run. The checkout is sparse: SDK, MCP bridge support, lite/webclient and pathfinding vendor code; **no game engine/content setup, engine dependencies, emulator build or local-world product setup**. Explicit HTTPS/WSS endpoints are required by this helper.

It first discovers and verifies an active run belonging to this private workspace. Re-running `setup`/`ensure` keeps its character, owner and queued work. A detected active run in this project's original default run directory is reported for explicit inspection rather than silently replaced. Unverified/unreachable active runtimes are not a reason to launch another account. An update available in the checkout is reported; setup does not overwrite loaded runtime code while it is active. Stop deliberately before upgrading core code. A deliberately new run uses `agent.mjs new` after the prior run has stopped; the lower-level `run.ts new/resume` remains available.

`setup` prepares only. `status` is read-only: it never creates directories, installs packages, provisions an account, requests a plan or changes a task. An incomplete setup/launch guard fails closed instead of overwriting another runtime. All generated credentials/run records stay private and ignored. The existing two-attempt/one-replacement old-character recovery is reused unchanged.

### Current-agent tool loop

The default private home is `wartime/.wartime/agent-runtime`; `--home /private/path` chooses another private workspace. Use the same home in each command:

```sh
node wartime/v2/agent.mjs status
node wartime/v2/agent.mjs context
node wartime/v2/agent.mjs tool '{"operation":"search","query":"Cook\u0027s Assistant"}'
node wartime/v2/agent.mjs tool '{"operation":"goal","goal":{"description":"Your current approved goal"}}'
node wartime/v2/agent.mjs request '{"reason":"Plan the next bounded routine"}'
node wartime/v2/agent.mjs complete RETURNED_REQUEST_ID '{"steps":[APPROVED_TYPED_STEPS],"repeat":1}'
```

The final line is a contract illustration: supply valid typed steps from current observations, not the placeholder. `context` returns status/current generation and pending prefetched planner requests; normally service one of those instead of creating redundant requests. You inspect status and cited knowledge, reason in **this already-running agent**, then return the approved proposal through `complete`. It supplies a unique proposal ID and a 60-second expiry if omitted; the stored request token is checked again. A changed life/task/world/session/controller makes old work stale. There is no model connection hidden behind this CLI.

While you reason or retrieve, the executor keeps running already-approved valid bounded work. Do not insert fixed thinking sleeps. Use `skills`, `remember` with the matching durable episode/routine ID, and `replay` for verified learning; historical revision-274 text is not proof of modified live mechanics. The short-call HTTP/Unix bridge remains the transport; SDK stdout cannot become a tool response.

`identity`/`status` report the actual runtime module SHA-256/build digest, the inspected SDK commit/core hashes, current run/character/world, owner and policy version. These values are computed from runtime files at startup, not from a caller-supplied controller label. Discovery compares them with its privately prepared build and known process identity. This is credible local source/build identification inside the trusted workspace, **not remote cryptographic attestation against a malicious same-user process**. Do not assume a separate Wartime environment or character is accessible merely because it says it uses “a controller.”

Planner telemetry records **agent/tool request-to-response turnaround**, including execution, retrieval and scheduling overhead. It is not isolated model inference time. `current_agent_tools` describes the submission route, not proof of a frontier model identity; fixtures are labeled controlled observations. Optional provider-backed unattended planning remains available only when deliberately supplied via an authorized provider callback.

The host executes approved routines and standing ordinary-resource goals while your agent thinks or remains unserved. A standing goal does not expire merely because a planning turn is slow, but the host cannot wake an inactive chat or invent new model reasoning. Genuinely unattended reasoning requires an already-supported persistent agent runtime or an explicitly configured optional provider. Neither is a readiness prerequisite for ordinary agent-driven gameplay.

### Approved online networking

Bun's SDK/client sockets use only the existing `HTTPS_PROXY`/`HTTP_PROXY` (and lowercase forms) plus `NO_PROXY` configuration through the documented WebSocket `proxy` option. Binary game subprotocols are preserved. No proxy address or credential is printed; TLS verification and environment variables are left intact. No alternate endpoint/port, invented proxy or fallback bypass is tried. If the approved route refuses/denies an upgrade, report that concrete blocker and stop. A successful unauthenticated socket alone is not account/client readiness.

## Default: a fresh account for each explicitly new run

For an already-prepared SDK workspace or explicit lower-level operation, the executable entry point is `wartime/v2/run.ts`. **No character name, account password, or previous-owner-stopped flag belongs in its configuration.** The existing-player path below remains an explicit optional mode.

On the chosen cloud/agent host:

```sh
umask 077
mkdir -p wartime/.wartime
cat > wartime/.wartime/run-config.json <<'JSON'
{
  "world": "https://rs-sdk.maxbittker.com",
  "gateway": "wss://rs-sdk.maxbittker.com/gateway",
  "onboarding": "skip_tutorial"
}
JSON
GATEWAY_DIRECT=false WARTIME_RUN_CONFIG=wartime/.wartime/run-config.json \
bun wartime/v2/run.ts new
```

Use the actual explicitly chosen online world/gateway; the addresses above are the known canonical service, not a redirect rule. Older local validation modes are historical, not the online agent setup path. The launcher probes the selected revision and WebSocket transport without a character handshake before attempting login. It never rotates endpoints, weakens TLS or changes proxy protections to fix a denial.

`new` means one explicitly started top-level session. It generates a CSPRNG 12-character lowercase alphanumeric name and a 20-character CSPRNG password within upstream limits, writes an atomic private run record **before login side effects**, starts a supervised lite client, verifies login and a fresh character-design/tutorial state, attaches the gateway, then connects one SDK owner. Default onboarding uses the pinned SDK's character-design/tutorial helper and verifies a fresh post-onboarding state before declaring readiness. `onboarding: "observe"` leaves setup untouched and reports tutorial-pending readiness honestly.

Output is sanitized JSON with a run ID, generated name, status, world and private bridge socket path. Credentials are kept only in the ignored private run directory (directories 0700, records 0600); they never enter command arguments, printed login URLs, bridge results or public reports. The original library remains shared reference data, while each generated character gets its own learning memory. No `bots/<hardcoded-name>/bot.env` or global fleet-runtime policy is used. The supported upstream session/client APIs are used directly by a minimal supervised bridge with no legacy-host remapping or hidden action policy.

A local config file is **not** registration proof. Milestones distinguish private config created, login attempted, client logged in, fresh state confirmed, client attached, onboarding complete and controller ready. The pinned login server auto-registers unknown users through game login; the local no-login-server engine establishes a new game profile instead of a SQL account. The fresh-state checks are observed game evidence, not a direct database existence query. Unknown/auth/transport outcomes do not get labeled as account creation.

Keep this process running and expose its returned socket through the existing short-call bridge. Tool calls, planner turns, ticks and planner turns reuse this identity. Do **not** invoke `new` for each tool call. For the same run after a clean stop or crash, use its returned run ID:

```sh
GATEWAY_DIRECT=false WARTIME_RUN_CONFIG=wartime/.wartime/run-config.json \
bun wartime/v2/run.ts resume RETURNED_RUN_ID
```

The [resume lease follow-up](resume-lease-followup-report.json) verifies that authoritative account generation and recovery budgets are reloaded under the acquired run lease; invalid newer records are never overwritten by a stale snapshot.

An active same-run lease causes repeated/concurrent startup to stop without launching another client or controller. Explicit resume preserves the account and progress when readiness succeeds. A verified successful resume resets its failed-attempt streak; cumulative attempt counters and replacement use remain in the private record. Old planner tokens never resume automatically.

### Stuck old-character reconnect: one automatic fresh fallback

If resuming/reconnecting the run's own old character stalls, the default budget is **two attempts, eight seconds each**, followed by **at most one automatic fresh-account replacement for that run**. Before replacement the supervisor cancels/drains its SDK owner, stops only its owned client, rechecks the selected service transport and strict ownership status, marks the old identity replaced, preserves its credentials/progress, and persists the new identity before starting it. The replacement is onboarded and gets a fresh memory scope. No supplied name or extra confirmation is needed.

The failure budget is persisted before each attempt, so crashes/repeated resume invocations cannot reset it. The replacement allowance never resets on recovery of the same run. A later successful ordinary resume keeps its character. Settings are bounded: `reconnectAttempts` 1–3 (default 2), `reconnectTimeoutMs` 1000–30000 (default 8000), `maxAutomaticReplacements` 0–1 (default 1), and `startupTimeoutMs` 1000–120000 (default 45000). The run retains its initial budget limits. A deliberately new top-level `new` command creates a separate run/account.

Only ambiguous **old-character** login/readiness failures qualify for fallback after supported health checks. Known network/policy/transport failures, unavailable servers/clients, outdated clients, rate limits, blocked authentication and unrelated owners stop with their actual reason. They are not repaired by new names. A fresh run's ambiguous login failure does not start an account retry storm. Only positively observed pre-login name collisions may select another name, at most twice; an invalid-password response is not treated as positive collision evidence.

The manager monitors its owned client/SDK after startup. Ownership pre-emption stops recovery rather than starting a takeover fight. Other resumable losses re-enter the same persisted budget. The gateway still lacks atomic distributed ownership claims; local run locks and strict status checks do not manufacture a compare-and-swap guarantee.

`SIGINT`/`SIGTERM` or bridge `stop` cancels/drains owned work and closes the run's owner/client. Parent-pipe closure also stops the lite child after a crash. Explicit recovery checks PID/start identity before stopping a recorded leftover child, then reconciles strict gateway status and only this run's stale locks/socket. It never deletes old account records or uses a global process kill. An ambiguous lock identity or a stranded `startup.guard` fails closed; reconcile the recorded processes before removing that exact guard manually.

See [new-run validation](new-run-validation-report.json) and the [ready-to-copy live-test prompt](NEW-RUN-PROMPT.txt). Its real cloud test uses the actual CLI, fresh characters, onboarding and actions; the account-specific reconnect timeout is explicitly injected in an isolated local gateway proxy. It is not a model delay or an online benchmark.

## Explicit existing-player mode (optional)

The following original mode is retained for deliberately attaching an existing player. It does not implement the default new-run flow and keeps its original handoff protections.


1. In a cloud/agent host, obtain RS-SDK at **`3aa493c3d26680df5bae2b475cc1805e3db05ae3`**, install its dependencies, and place this repository's `wartime/` next to its `sdk/` and `mcp/`. Changes since the older `aff0406…` reference concern server logging; the SDK action/execution API is unchanged. Use Bun 1.4.4 (tested) and Node 24+ for Node tests. Download the original library with `node wartime/setup-knowledge.mjs` (use `NODE_USE_ENV_PROXY=1` where the cloud environment supplies a proxy).
2. Inspect the existing player's source, actual world/gateway, dispatcher and ownership. Keep its client attached. Preserve any existing strategy and PvP behavior through an adapter review: this new controller supplies typed primitives, not proof of equivalent tactical behavior.
3. Prefer **attached-owner injection**: retire the old action dispatcher and pending callbacks, set its SDK `autoReconnect` to false, and call `startInjected({sdk, config})` from `wartime/v2/host.ts`. This performs no new control handshake. All subsequent game actions must go through this host. Do not leave old code with a usable raw SDK dispatch path.
4. Standalone startup is an explicit replacement handoff. Stop the previous owner and confirm its queued work is gone before enabling the private `handoff` fields below. Startup reserves a local lock, performs a strict status request, requires a successful zero-controller result and an attached in-game client, then connects once. **The upstream last-controller-wins gateway has no atomic claim/lease.** A status/handshake race across machines remains possible. Local locks only coordinate hosts using the same storage. Do not use standalone startup where this residual risk is unacceptable; use the attached owner or implement a gateway compare-and-swap lease first.
5. On disconnect/pre-emption the host cancels its own work, blocks further plans, and never reconnects automatically. An operator must reconcile ownership and perform another explicit handoff. Network/auth/unknown-status errors do not mean another controller exists or that zero controllers are present.

Private configuration (chmod `600`; store outside the public tree):

```json
{
  "world": "https://rs-sdk.maxbittker.com",
  "gateway": "wss://rs-sdk.maxbittker.com/gateway",
  "character": "YOUR_PLAYER",
  "socket": "/private/runtime/wartime-v2.sock",
  "directory": "/private/runtime/memory",
  "initialVersion": "steady-1",
  "handoff": {
    "previousOwnerStopped": false,
    "acceptNonAtomicGatewayRisk": false,
    "world": "https://rs-sdk.maxbittker.com",
    "character": "YOUR_PLAYER"
  }
}
```

These canonical service addresses are an explicit example, not permission to move an established character there. Set the actual verified world and matching gateway host. V2 does not rewrite legacy Fly.io names, follow HTTP status redirects, or probe alternate gateway ports. Remote connections require HTTPS/WSS; this online product flow requires HTTPS/WSS. `GATEWAY_DIRECT=false` preserves the selected SDK endpoint.

Supply the authorized password privately through the host's secret environment as `WARTIME_GAME_PASSWORD`; never put it in model text, commands pasted into a chat, a committed file, or logs. No live player credentials are bundled. Start the standalone host only after the explicit handoff:

```sh
GATEWAY_DIRECT=false WARTIME_V2_CONFIG=/private/runtime/config.json \
bun wartime/v2/host.ts
```

The long-lived host must **not** be launched inside RS-SDK `execute_code`: later calls cancel that execution scope. Use a supervised process on the authorized host. `SIGINT`/`SIGTERM` cancel and drain owned actions, finish atomic private writes, release locks, and disconnect the standalone SDK. Stopping execution does not log the character out or stop server ticks. After a crash, reconcile processes and gateway status before removing an exact stale socket or lock; startup never deletes another owner's lock/socket automatically.

## Model bridge and tool contract

The host exposes HTTP `POST /tool` over a **Unix socket, mode 0600**, not a public network port. Request bodies are bounded to 64 KiB, eight concurrent requests, and short deadlines. Your model host can expose `tool(socket, request)` from `client.mjs` as its own tool, or run the short CLI:

```sh
export WARTIME_V2_SOCKET=/private/runtime/wartime-v2.sock
node wartime/v2/client.mjs '{"operation":"status"}'
node wartime/v2/client.mjs '{"operation":"goal","goal":{"description":"Continue the approved task"}}'
```

`goal` returns a token containing owner, world, character, session, life, task and controller generations. `status` also returns this token, bounded game observations, recent bounded events and telemetry. Player chat is labeled **UNTRUSTED_GAME_DATA**; it is never dispatched or evaluated. Retrieved prose and game dialog are also observations, not instructions. Status excludes SDK configuration/passwords. Keep all runtime observations private.

Submit a proposal with a unique id, an unchanged current token, an expiry no more than 120 seconds ahead, 1–10 typed steps and 1–20 repeats. At most four routines are queued. For example, after observing an appropriate open tile:

```js
const {tool} = await import('./wartime/v2/client.mjs');
const socket = process.env.WARTIME_V2_SOCKET;
const state = await tool(socket, {operation:'status'});
await tool(socket, {operation:'submit', proposal:{
  id:crypto.randomUUID(), token:state.token, expiresAt:Date.now()+60000,
  repeat:1, steps:[{
    action:'walk', x:3223, z:3222, level:0, cooldownTicks:1,
    expect:[{type:'position',x:3223,z:3222,level:0}]
  }]
}});
```

The coordinates above are illustrative; use current observations. Publication revisions and observed tick transitions are separate. Duplicate proposal IDs/publications cannot duplicate work; clock resets, life changes, task changes and ownership changes invalidate delayed plans. A model round trip is never required between steps/repeats. Freshness, animation, cooldown, inventory capacity and explicit preconditions gate dispatch. Active helpers are not restarted each tick. Already-satisfied state criteria send nothing and cannot teach a successful skill. Failures pause ordinary work for re-planning.

The already-running agent is the default planner; an external provider is optional:

- `planner_requests`: inspect automatically prefetched pending requests. `planner_request` can request one explicitly with bounded contextual data.
- Reason through your existing agent/tools outside the executor; deliberately configured optional providers can use `executor.planWith(provider, context)`. The provider receives a request/token and returns a bounded proposal, never SDK access. No provider is bundled or billed.
- `planner_complete: {id, proposal}` supplies the reply (`proposal` can be omitted to decline). The saved token is checked again. Request duration is measured; a local pending bridge request is not reported as a real model duration.
- `search: {query,limit?,category?}` and `record: {id}` run the real SQLite library in bounded separate worker processes, outside the scheduler. Preserve citations and distinguish historical revision 274 from modified live state.
- `skills`, `remember: {name,episodeId,description}`, `replay: {name}` use world/character-scoped private memory. Only complete episodes with observed verified steps become skills. Replay rechecks fresh targets and prerequisites.
- `resume` requires fresh owned state after a deliberate pause and returns a new task token. It cannot unblock lost ownership. `stop` stops owned execution; terminate the host with its process signal to close its socket/standalone SDK.

## Actions and safety

V1's reviewed action signatures are reused for walk, chop, mine, talk, object/NPC interaction, pickup, eat, equip, bank operations, use-item, burn logs and dialogs. V2 adds:

- `attack_npc: {target:{kind:'npc',id?,index?,name?}, expect:[...]}` and `attack_player: {target:{kind:'player',index?,name?}, expect:[...]}`. Combat selectors require index or exact name and explicit kind. NPC type `id` is never substituted for NPC world `index`; player packets use player indices. The current entity is resolved again immediately before helper dispatch.
- `prayer_on` / `prayer_off` with `index:0..14`; `combat_style` with `style:0..3`; `escape` with `x,z,level`.
- Additional expectations: `prayer:{index,active}`, `combat_style:{style}`, `combat_target:{kind,index}`. Other expectation/precondition formats are documented in v1 and validated again. `timeoutMs` bounds each action helper and its effect wait. Cooldowns are explicit observed-tick lower bounds, not claims about all live server mechanics.


## Historical maintenance evidence

[Maintenance follow-up](maintenance-followup-report.json) and [live maintenance](live-maintenance-report.json) describe older builds. The current runtime has no church movement/update workflow or automatic gameplay risk interruption. Core updates use an explicit manual stop and normal restart; historical reports are not current setup instructions.

## Validation and telemetry

```sh
node --test wartime/v2/test/*.test.mjs
bun test wartime/v2/test/*.test.mjs wartime/v2/test/adapter.test.ts
```

Deterministic tests are supplemental; product setup and live validation target only the selected online service. Older local/emulator probes and church traces are historical and are not current setup instructions. Never change the live tick rate for a speed demonstration.

Telemetry reports bounded sample distributions (n, p50/p95/p99, min/max): observed tick cadence and interval-to-interval jitter; observer-callback-to-helper dispatch; SDK publication age at dispatch; raw SDK packet acknowledgement; helper-start-to-observed-postcondition; planner request duration; and explicit manual-control events. Counts distinguish cooldown, ongoing helper/animation, approved eligible work, no approved work, planner starvation, manual holds, verified throughput, failures, cancellations and pre-emption/disconnects. Small-sample percentiles are descriptive, not stable performance estimates. Client tick counters are session-relative; network batching can compress observed intervals. These metrics cannot identify exact server phase or separate all server/network latency. Packet acknowledgement does not prove game execution.

For **live validation**, use Wartime's already-authorized runtime with the default fresh-account run (or explicitly choose existing-player mode). Record the configured world, actual agent/tool turnaround (separate any explicitly measured inference time), workload and comparable before/after observation windows. Keep approved routines running during real model calls, measure counts/latency and retain all ordinary recovery periods. If no real PvP encounter occurs, report it as untested. A local probe or synthetic pending promise never substitutes for these online requirements. Fresh-account establishment through the supported client is now authorized; unrelated account takeover is never part of startup. Prior reports describing no account signup remain historical.

### Focused transport and gathering checks

This bridge is **HTTP over a private Unix socket, not MCP stdio**. SDK console output stays on the host process's diagnostic streams; it cannot become a socket response or corrupt JSON-RPC stdout. The real standalone child-process probes exercised SDK logging concurrently with parsed bridge responses. A model host that wraps this bridge as MCP must still reserve its own stdout for JSON-RPC.

Repeated gathering retains an owned target/epoch and observed baseline after a successful helper. Further fresh inventory/XP gains from the same continuing activity can satisfy approved repeated steps without another interaction. An active animation on that target suppresses re-dispatch; if continuation becomes uncertain while the target remains, the executor pauses for re-planning instead of guessing and clicking again. A disappeared target clears that continuation. A server-side interaction already sent may continue beyond a routine's bounded verified steps; append an approved escape/other interrupt when the task requires it to stop, and reconcile before updates.

`helperPendingTicks` and `helperPendingWithoutObservedProgressTicks` describe pending work, **not proven productivity**. `animationObservedTicks` is only animation evidence. `observedProgressPublications` and `observedGatherProgressPublications` count actual observed changes; `continuedGatherEffects` counts verified passive routine steps and `packetDispatches:interactLoc` counts SDK packet dispatches. A lack of progress does not by itself prove avoidable idle time (random gathering attempts can fail); the avoidable-idle counter only detects scheduler opportunities with approved eligible work and no active helper. It cannot identify hidden server idleness inside an unresolved helper. The real focused probe gathered regular-tree logs/XP; continuous-tree non-resend is covered separately by deterministic observed-gain/animation tests. Neither is evidence of live model timing.

Callers must correlate `status.lastEpisodeRoutineId` with the accepted routine's ID before using `lastEpisode` as that routine's durable learning evidence. Action completion counters can lead asynchronous disk persistence.

A client combat target can change before the server accepts an attack. Target selection alone is therefore not recorded as verified server execution or eligible learning evidence; combat routines need an additional observed combat-skill XP expectation. A miss/refusal or unproven outcome pauses for re-planning. The isolated player probe observed client targeting and later system refusal outside the wilderness, not successful PvP damage. Its verified escape does not establish duel tactics.
