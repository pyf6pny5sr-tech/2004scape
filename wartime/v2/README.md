# Wartime v2: persistent single-owner controller

Start here for the new implementation. v1 and its historical report remain unchanged. V2 runs ordinary approved routines in one long-lived Bun process while the frontier model thinks through short private bridge calls. It does not select a model, call a paid provider automatically, train weights, or run upstream Minecraft Voyager. No separate sanitized controller ZIP was supplied or inspected; compatibility with Wartime's existing controller must be checked in its own runtime.

The [focused maintenance follow-up report](maintenance-followup-report.json) covers rollback on unsafe/stale/deadline/canceled revalidation and two consecutive fresh idle ticks before checkpointing. Historical gameplay/timing evidence and live limitations below remain unchanged.

**Online agent integration passed in one fresh cloud session.** See [agent-first validation](agent-first-validation-report.json): approved proxy transport, real login/onboarding, current-agent plan acceptance, four verified actions and skill replay. [Supplemental live maintenance](live-maintenance-report.json) also verified same-account church relocation, steady-1 → cautious-2, unchanged owner and resumed queued action. PvP remains untested online. Earlier reports retain their historical limits. Never infer ownership or gameplay from a browser image or failed status request.

## Approved continuity while the current agent plans

The current agent can approve a **finite woodcutting/Firemaking reserve** alongside an ordinary short proposal. The executor chooses fresh eligible work from that exact recipe and inventory while the agent services prefetched requests. It never generates new goals or model reasoning. Do not reset the goal or call `resume` just to answer a refill request: those invalidate work. Use the current pending request and `planner_complete`/`agent.mjs complete` to append ordinary work and renew the reserve without canceling the current action.

Add `continuation` to the proposal (compute the future timestamp in your current tools):

```js
{
  steps: [/* ordinary approved typed steps, using current observations */],
  continuation: {
    recipe: "woodcut_firemake",
    target: {name: "Tree"}, log: {name: "Logs"},
    area: {x: CURRENT_AREA_X, z: CURRENT_AREA_Z, level: 0, radius: 12},
    minHp: CURRENT_FULL_HEALTH,
    maxActions: 40, expiresAt: Date.now() + 110000,
    fireTiles: [/* up to 8 explicitly approved {x,z} alternatives inside area */]
  }
}
```

This is a contract illustration; choose actual area/tiles from the live world, not the placeholders. Only `Tree`/`Logs` and `Oak`/`Oak logs` recipes are accepted. Reserve approval lasts **at most 120 seconds and 40 generated actions**, not an entire session. Area radius is at most 16 tiles. Current status/context includes remaining actions, expiry/runway, backoff and failures. Request prefetch occurs while approved work remains; service it before runway drops below 45 seconds or action reserve is low. New explicit queued work takes priority at the next action boundary. A proposal without `continuation` retires the old reserve; a changed goal cancels/drains it. Renewal never extends an already-active action's original expiry/safety authority.

Within the approved area, the reserve burns existing matching logs before gathering another reachable approved tree. Burning that fails or finds an observed fire can use only the supplied bounded alternative tiles; movement is for useful fire placement, not idle padding. It never repeats chat, combat, trade, arbitrary items or destructive actions. Each operation has fresh expected effects, target coordinates/type and SDK cancellation guards. Busy productive gathering is not re-clicked each tick.

A known ordinary resource failure may recover with **two consecutive attempts, tick backoff of 2 then 4, and at most 6 recoveries per grant**. Failed dependent tails are discarded; each generated replacement is reselected from fresh inventory/targets. Unknown/auth/network/ownership/rate/protocol errors do not auto-retry. An ambiguous helper result counts as verified only if a fresh same-life/same-generation observation actually satisfies every original expected outcome. It is never successful merely because the promise resolved.

Expiry, exhaustion, stale/disconnected state, damage/combat, leaving the area, unavailable targets or a full inventory with no approved burnable logs yield/stop. Stop, cancellation, emergencies and church maintenance revoke live continuation authority; maintenance may regenerate only a still-valid checkpointed grant after fresh revalidation, without reviving expired generated actions. These limits mean the agent must keep servicing real requests; finite reserves cannot wake an inactive chat or provide unlimited autonomy.

For a comparable passive benchmark, use [continuity-capture.mjs](continuity-capture.mjs) `init/begin/claim/complete/watch/stop` with one private `--directory` and existing run `--home`. `begin` defaults to a fixed 20-minute deadline, `watch` is bounded to 45 seconds and refuses an open planning claim, and `claim` must bracket actual gameplay reasoning/tools only. All request/event/exact-boundary evidence is captured automatically before play; no ledger or report edits belong inside claims. [continuity-report.mjs](continuity-report.mjs) performs offline comparison using the unchanged baseline classifier and requires an explicit post-run window audit before calling a subset gameplay-only.

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

The autonomy boundary is finite: the host executes approved routines while your agent is active or thinking. It cannot wake an inactive chat, invent new model reasoning, or turn a finite routine into unlimited autonomy. Genuinely unattended reasoning requires an already-supported persistent agent runtime or an explicitly configured optional provider. Neither is a readiness prerequisite for ordinary agent-driven gameplay.

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

Keep this process running and expose its returned socket through the existing short-call bridge. Tool calls, planner turns, ticks and church policy updates reuse this identity. Do **not** invoke `new` for each tool call. For the same run after a clean stop or crash, use its returned run ID:

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
  "stagedVersions": ["cautious-2"],
  "safety": {"eatAtHp": 4},
  "handoff": {
    "previousOwnerStopped": false,
    "acceptNonAtomicGatewayRisk": false,
    "world": "https://rs-sdk.maxbittker.com",
    "character": "YOUR_PLAYER"
  }
}
```

These canonical service addresses are an explicit example, not permission to move an established character there. Set the actual verified world and matching gateway host. V2 does not rewrite legacy Fly.io names, follow HTTP status redirects, or probe alternate gateway ports. Remote connections require HTTPS/WSS; plain HTTP/WS is allowed for a local emulator. `GATEWAY_DIRECT=false` preserves the selected SDK endpoint.

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

A stable safety monitor can abort only this host's action, waits for it to unwind, then uses observed food or a privately configured escape destination. It pauses ordinary work and invalidates previous plans. Recovery attempts are bounded; a missing fallback or failed safety action is explicit. It does not promise PvP competence, invent safe destinations or undo already-sent packets. The same monitor stays loaded through trusted policy maintenance. Old-generation callbacks are prevented from sending further SDK packets by an execution scope plus a guarded SDK proxy.

## Church maintenance and trusted deployment boundary

Configure an actual church privately after verifying the chosen world, routes and rules. The arrival/anchor below were also verified in the [same-account live maintenance check](live-maintenance-report.json); they are not a universal safe zone. Recheck current world rules, reachability and safety before use:

```json
{"church":{"operatorVerifiedWorldRules":true,"x":3243,"z":3209,"level":0,"radius":0,"anchorId":409,"anchorRadius":6,"minHp":8,"playerClearance":5}}
```

The anchor is an observed Altar at `(3243,3205,0)`; the blocked altar tile is not a walk destination. Arrival requires the configured region/plane, an actual nearby configured anchor, enough HP, no current combat, no nearby fighting NPCs and no nearby players within the clearance. These checks cannot prove absence of an unseen threat or confer PvP immunity. Missing anchors, unsafe arrival or stale state postpone maintenance with a reason.

`maintenance: {version:'cautious-2'}` follows REQUESTED → RELOCATING → QUIESCING → CHECKPOINTED → UPDATING → REVALIDATING → RESUMING. It uses the same SDK owner, cancels/drains old work, waits for fresh idle observations, writes a full atomic private checkpoint, swaps a trusted policy module, requires another fresh safe observation, then resumes the saved goal and remaining queued approved work with new generations. An interrupted in-flight command is **not blindly replayed**; its routine requires re-planning after reconciliation. `cancel_maintenance` restores the prior policy and pauses for explicit re-planning. Activation/revalidation failure rolls back the policy and stays paused. Time in maintenance is intentional downtime, not planner idle time.

The stable supervisor loads a **fixed trusted registry** from `versions/steady.mjs` and `versions/cautious.mjs`. Staging is operator-only through private startup `stagedVersions`; the model bridge cannot stage files, import paths, execute shell commands or download executable updates. The tested update changes real scheduling policy from a one-tick to a two-tick minimum cooldown and retains the stable safety/SDK owner. This is a policy-module version handoff, **not arbitrary hot replacement of the supervisor, adapter or Node runtime**. New registry code must be reviewed/tested/deployed by the trusted operator. Updating the supervisor itself requires a separate controlled stop/handoff; do not claim an untested arbitrary code hot-swap.

## Validation and telemetry

```sh
node --test wartime/v2/test/*.test.mjs
bun test wartime/v2/test/*.test.mjs wartime/v2/test/adapter.test.ts
```

The deterministic tests are supplemental. The opt-in real local probe starts the actual standalone host, uses an already-attached **disposable local character**, performs movement/replay/retrieval and a church handoff, and writes ignored private evidence:

```sh
WARTIME_LOCAL_BOT_ENV=/private/local-test/bot.env \
bun wartime/v2/test/cloud-gameplay.ts
```

It requires the local engine on 8888 and gateway on 7780. It refuses a non-local bot configuration. Use the upstream setup and tested build exception described in v1's local-test documentation. The live engine's tick rate must not be changed for a speed demonstration.

Telemetry reports bounded sample distributions (n, p50/p95/p99, min/max): observed tick cadence and interval-to-interval jitter; observer-callback-to-helper dispatch; SDK publication age at dispatch; raw SDK packet acknowledgement; helper-start-to-observed-postcondition; planner request duration; and maintenance duration. Counts distinguish cooldown, ongoing helper/animation, approved eligible work, no approved work, planner starvation, intentional maintenance, verified throughput, failures, cancellations and pre-emption/disconnects. Small-sample percentiles are descriptive, not stable performance estimates. Client tick counters are session-relative; network batching can compress observed intervals. These metrics cannot identify exact server phase or separate all server/network latency. Packet acknowledgement does not prove game execution.

For **live validation**, use Wartime's already-authorized runtime with the default fresh-account run (or explicitly choose existing-player mode). Record the configured world, actual agent/tool turnaround (separate any explicitly measured inference time), workload and comparable before/after observation windows. Keep approved routines running during real model calls, measure counts/latency and perform a planned church update when safe. If no real PvP encounter occurs, report it as untested. A local probe or synthetic pending promise never substitutes for these online requirements. Fresh-account establishment through the supported client is now authorized; unrelated account takeover is never part of startup. Prior reports describing no account signup remain historical.

### Focused transport and gathering checks

This bridge is **HTTP over a private Unix socket, not MCP stdio**. SDK console output stays on the host process's diagnostic streams; it cannot become a socket response or corrupt JSON-RPC stdout. The real standalone child-process probes exercised SDK logging concurrently with parsed bridge responses. A model host that wraps this bridge as MCP must still reserve its own stdout for JSON-RPC.

Repeated gathering retains an owned target/epoch and observed baseline after a successful helper. Further fresh inventory/XP gains from the same continuing activity can satisfy approved repeated steps without another interaction. An active animation on that target suppresses re-dispatch; if continuation becomes uncertain while the target remains, the executor pauses for re-planning instead of guessing and clicking again. A disappeared target clears that continuation. A server-side interaction already sent may continue beyond a routine's bounded verified steps; append an approved escape/other interrupt when the task requires it to stop, and reconcile before updates.

`helperPendingTicks` and `helperPendingWithoutObservedProgressTicks` describe pending work, **not proven productivity**. `animationObservedTicks` is only animation evidence. `observedProgressPublications` and `observedGatherProgressPublications` count actual observed changes; `continuedGatherEffects` counts verified passive routine steps and `packetDispatches:interactLoc` counts SDK packet dispatches. A lack of progress does not by itself prove avoidable idle time (random gathering attempts can fail); the avoidable-idle counter only detects scheduler opportunities with approved eligible work and no active helper. It cannot identify hidden server idleness inside an unresolved helper. The real focused probe gathered regular-tree logs/XP; continuous-tree non-resend is covered separately by deterministic observed-gain/animation tests. Neither is evidence of live model timing.

Callers must correlate `status.lastEpisodeRoutineId` with the accepted routine's ID before using `lastEpisode` as that routine's durable learning evidence. Action completion counters can lead asynchronous disk persistence.

A client combat target can change before the server accepts an attack. Target selection alone is therefore not recorded as verified server execution or eligible learning evidence; combat routines need an additional observed combat-skill XP expectation. A miss/refusal or unproven outcome pauses for re-planning. The isolated player probe observed client targeting and later system refusal outside the wilderness, not successful PvP damage. Its verified escape does not establish duel tactics.
