# Wartime v2: persistent single-owner controller

Start here for the new implementation. v1 and its historical report remain unchanged. V2 runs ordinary approved routines in one long-lived Bun process while the frontier model thinks through short private bridge calls. It does not select a model, call a paid provider automatically, train weights, or run upstream Minecraft Voyager. No separate sanitized controller ZIP was supplied or inspected; compatibility with Wartime's existing controller must be checked in its own runtime.

**Online validation is still required.** See `validation-report.json` for local gameplay and exact limits. Never infer SDK ownership or live gameplay from a browser image or a failed status request.

## Adopt it with one player

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

The model/provider remains configurable outside the host:

- `planner_requests`: inspect automatically prefetched pending requests. `planner_request` can request one explicitly with bounded contextual data.
- Call your actual authorized model **asynchronously** outside the executor; optional attached providers can use `executor.planWith(provider, context)`. The provider receives a request/token and returns a bounded proposal, never SDK access. No provider is bundled or billed.
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

Configure an actual church privately after verifying the chosen world, routes and rules. Example **local tested church** configuration, not a universal safe zone:

```json
{"church":{"operatorVerifiedWorldRules":true,"x":3243,"z":3209,"level":0,"radius":0,"anchorId":409,"anchorRadius":6,"minHp":8,"playerClearance":5}}
```

The local anchor is an observed Altar at `(3243,3205,0)`; the blocked altar tile is not a walk destination. Arrival requires the configured region/plane, an actual nearby configured anchor, enough HP, no current combat, no nearby fighting NPCs and no nearby players within the clearance. These checks cannot prove absence of an unseen threat or confer PvP immunity. Missing anchors, unsafe arrival or stale state postpone maintenance with a reason.

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

For **live validation**, use Wartime's already-authorized runtime and existing player. Record the configured world, actual model/provider timings, workload and comparable before/after observation windows. Keep approved routines running during real model calls, measure counts/latency and perform a planned church update when safe. If no real PvP encounter occurs, report it as untested. A local probe or synthetic pending promise never substitutes for these online requirements. No live credentials, account signup or automatic takeover are part of this build.

### Focused transport and gathering checks

This bridge is **HTTP over a private Unix socket, not MCP stdio**. SDK console output stays on the host process's diagnostic streams; it cannot become a socket response or corrupt JSON-RPC stdout. The real standalone child-process probes exercised SDK logging concurrently with parsed bridge responses. A model host that wraps this bridge as MCP must still reserve its own stdout for JSON-RPC.

Repeated gathering retains an owned target/epoch and observed baseline after a successful helper. Further fresh inventory/XP gains from the same continuing activity can satisfy approved repeated steps without another interaction. An active animation on that target suppresses re-dispatch; if continuation becomes uncertain while the target remains, the executor pauses for re-planning instead of guessing and clicking again. A disappeared target clears that continuation. A server-side interaction already sent may continue beyond a routine's bounded verified steps; append an approved escape/other interrupt when the task requires it to stop, and reconcile before updates.

`helperPendingTicks` and `helperPendingWithoutObservedProgressTicks` describe pending work, **not proven productivity**. `animationObservedTicks` is only animation evidence. `observedProgressPublications` and `observedGatherProgressPublications` count actual observed changes; `continuedGatherEffects` counts verified passive routine steps and `packetDispatches:interactLoc` counts SDK packet dispatches. A lack of progress does not by itself prove avoidable idle time (random gathering attempts can fail); the avoidable-idle counter only detects scheduler opportunities with approved eligible work and no active helper. It cannot identify hidden server idleness inside an unresolved helper. The real focused probe gathered regular-tree logs/XP; continuous-tree non-resend is covered separately by deterministic observed-gain/animation tests. Neither is evidence of live model timing.

Callers must correlate `status.lastEpisodeRoutineId` with the accepted routine's ID before using `lastEpisode` as that routine's durable learning evidence. Action completion counters can lead asynchronous disk persistence.

A client combat target can change before the server accepts an attack. Target selection alone is therefore not recorded as verified server execution or eligible learning evidence; combat routines need an additional observed combat-skill XP expectation. A miss/refusal or unproven outcome pauses for re-planning. The isolated player probe observed client targeting and later system refusal outside the wilderness, not successful PvP damage. Its verified escape does not establish duel tactics.
