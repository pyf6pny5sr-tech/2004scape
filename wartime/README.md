# Wartime · 2004Scape controller

**New implementation:** [Wartime v2: persistent host, model bridge and church maintenance](v2/README.md). Start there for the new controller and [copy/paste handoff](v2/HANDOFF.txt). Its [separate validation report](v2/validation-report.json) distinguishes disposable cloud gameplay from outstanding online/model validation. The v1 implementation and historical report below remain intact.

This project combines cited 2004Scape knowledge with a model-driven RS-SDK controller. Current v2 runs use an explicitly configured world/gateway; the legacy target was https://rs-sdk-demo.fly.dev/. It provides:
- the model supplies Voyager-style curriculum, planning and critique;
- the 31,207-record knowledge library supplies cited historical reference material;
- this controller runs bounded RS-SDK actions, checks observed results and stores reusable routines.

It is an original adaptation of Voyager's design, not the upstream Minecraft runtime, and does not train model weights. It does not bundle or select a particular ChatGPT model. The model must have a host that exposes the RS-SDK tools.

## Current startup and handoff request

The current default is **a fresh account for each explicitly new top-level run**, without a supplied character name/password. Use [the v2 new-run launcher and instructions](v2/README.md), [the current handoff](v2/HANDOFF.txt), and [the live-test prompt](v2/NEW-RUN-PROMPT.txt). Normal tool/planner/tick/church turns keep the run's identity. A stuck old-character reconnect has a persisted bounded budget and at most one automatic fresh replacement after safe retirement and health checks; network failures do not trigger account storms.

This user requirement supersedes the older existing-player-only startup constraint. Existing-player attachment remains an explicit optional mode with its handoff protections. Run on the chosen cloud/agent host, not Windows, and keep all account records private. The earlier [tick/maintenance requirements](TICK-AND-MAINTENANCE.md) remain relevant except for their superseded account-selection restriction. Historical v1 status below is preserved.

## Historical v1 status

Cloud-validated development preview. Node 24 controller tests, Bun controller/agent tests, and 32 relevant upstream SDK tests pass. In an isolated Linux cloud emulator, an actual headless client observed a disposable character, verified a two-step walk, saved and replayed the learned routine, and retrieved a cited knowledge record. A separate Chromium client rendered the same disposable character for a screenshot. See `validation-report.json` for exact evidence and limits.

The supplied Fly.io endpoint currently returns HTTP 301 to `https://rs-sdk.maxbittker.com/`. An unauthenticated HTTP GET to its `/gateway` also timed out after 20 seconds. No remote character was created or connected. The upstream SDK at the reference commit also rewrites the legacy hostname in `deriveGatewayUrl` and its lite runner. The default Wartime guard deliberately continues to require the user's Fly.io gateway. Confirm the intended world and use an explicit `gatewayUrl` when wiring a real host; do not rely on the upstream legacy-host helpers or follow redirects to move a character silently. A real-character connection is not ready until that world decision and the model host are supplied.

## Historical v1 setup

Run these steps on the chosen cloud or agent host. A GitHub Pages website stores reference files; it does not run this controller.

1. Obtain https://github.com/MaxBittker/rs-sdk and follow its setup documentation. The API was checked at commit aff0406ea1cc651a0ae5f1626c6fb02043179f26. If the world requires a newer client, update the SDK and recheck compatibility.
2. Copy this directory into that checkout as `wartime/`, next to `sdk/` and `mcp/`.
3. With Node 24+, run `node wartime/setup-knowledge.mjs`. This downloads the public SQLite knowledge library into `wartime/.wartime/` and verifies its file fingerprint. It neither uploads local files nor connects to the game.
4. After confirming the intended remote world, configure the bot and client for that exact world. The reference SDK's legacy hostname helpers remap Fly.io, so an explicit SDK `gatewayUrl: 'wss://rs-sdk-demo.fly.dev/gateway'` is required to preserve this package's current default; client reachability there remains unverified. Keep its generated password in its private `bot.env` file. Never put credentials, character logs or API keys in this public repository.
5. Configure the host to expose the SDK's MCP server. Follow `mcp/README.md` in that SDK. MCP automatically attaches a game client when configured to do so; standalone scripts require an already-running browser or lite client.
6. Give the model the companion `PROMPT.txt`. A text-only chat without execution/game tools can plan, but cannot operate this controller.

The default controller checks that the SDK connection targets `wss://rs-sdk-demo.fly.dev/gateway`. If its connection is configured for another world, it refuses actions.

## Tool calls

The existing RS-SDK `execute_code` tool accepts a script module and JSON arguments:

```json
{
  "bot_name": "YOUR_CHARACTER",
  "script": "wartime/agent.ts",
  "args": { "operation": "observe" }
}
```

Operations:
- `observe`: game observations, saved goal and learned routines. No SDK credentials.
- `search`: `query`, optional `limit` (1–20) and `category`. Returns cited records. Use `record` with `id` for a full record.
- `checkpoint`: `goal: {description, nextStep}`.
- `run_plan`: `plan: {goal, recordIds, steps}`; optional `timeoutMs` (1,000–60,000).
- `remember`: `name`, `episodeId`, `description`. Requires observed success for every step in that episode.
- `skills`, `episode` with `id`, and `run_skill` with `name`.

You can also search without connecting a character:
`node wartime/search.mjs "iron mining"`.

Example plan, only after observing a reachable tree and suitable equipment:

```json
{
  "operation": "run_plan",
  "plan": {
    "goal": "Collect one log",
    "recordIds": [],
    "steps": [{
      "action": "chop",
      "target": {"name": "Tree"},
      "expect": [
        {"type": "inventory_gain", "item": {"name": "Logs"}, "amount": 1},
        {"type": "xp_gain", "skill": "Woodcutting", "amount": 1}
      ]
    }]
  }
}
```

A plan has 1–10 steps. Targets use exact names or numeric IDs from current observations and are resolved again for every action. Plans stop on failure, uncertain completion or stale state. The SDK execution scope cancels further waits and action packets at the deadline; already-sent actions may still take effect. Re-observe after a timeout.

Supported actions: walk, chop, mine, talk, interact_object, interact_npc, pickup, eat, equip, open_bank, close_bank, close_interface, deposit, withdraw, use_item_on_object, use_item_on_npc, burn_logs, attack_npc, dialog_choice, dialog_continue.

Every step supplies explicit `expect` criteria:
- `inventory_gain` / `inventory_loss`: `item: {name or id}`, `amount`.
- `xp_gain`: `skill`, `amount`; these are observed SDK units, not raw source-config units.
- `hp_gain`: `amount`.
- `position`: `x`, `z`, `level`, optional `tolerance` (0–5).
- `bank_open`: boolean `value`.
- `equipped`: `item: {name or id}`.
- `dialog_changed`: proves a dialogue transition only, not quest completion.

Optional preconditions: `inventory_at_least` with item and amount; `skill_at_least` with skill and level; `hp_at_least` with amount. See `validateStep` in controller.mjs for action fields. Reusing a skill reruns all its checks; a successful historical episode is not a guarantee of future success.

Knowledge records and skill memory are distinct. Memory is scoped by world and character under the ignored `.wartime/` directory. A lock prevents overlapping Wartime runs for the same character on the same filesystem. Other independent controllers must still be stopped; this is not a distributed lock.

## Version differences

The knowledge library targets reconstructed LostCity revision 274 (November 23, 2004). RS-SDK documents faster leveling, infinite run energy, disabled random events and optional custom content. Its current source is not proof of the version deployed at the user's URL. Check live observations and server-specific documentation, and record deviations rather than silently treating historical values as live truth.

## Tests

From this directory: `node --test test/*.test.mjs` (Node 24+). In the SDK checkout with this directory installed next to `sdk/` and `mcp/`, run `bun test wartime/test/controller.test.mjs wartime/test/agent.test.ts`. Agent tests require the downloaded knowledge DB and installed SDK dependencies. They exercise the real SDK and MCP execution modules with controlled state, including timeout, parent cancellation, listener cleanup, lock release, script loading, credential omission and Bun SQLite retrieval.

For a proxy-managed cloud environment, `NODE_USE_ENV_PROXY=1 node wartime/setup-knowledge.mjs` uses Node 24's support for the existing proxy configuration. Keep TLS verification enabled.

### Disposable local cloud test

Run the upstream engine, gateway and lite client entirely in the cloud. The reference engine initially fails a `.loc checksum mismatch`; the tested local build uses its supported `build.verify: false` in `server/engine/data/config/world.json` for modified content. This is an upstream local-build exception, not validation against an original cache. The tested engine is revision 289 with its default accelerated XP configuration, not the historical revision-274 knowledge baseline. Build the browser client with `bun run build:dev` in `server/webclient` if a rendered view is wanted.

Create a disposable local bot privately with `SERVER=localhost:8888` and `GATEWAY_URL=ws://localhost:7780/`, attach its lite client, and complete setup with the SDK's `skipTutorial` helper. The runner's `localhost` alone selects HTTP port 80 for cache downloads; use the actual engine web port. Credentials must meet the upstream 1–20 character password limit.

Then from the SDK checkout:

```sh
WARTIME_TEST_WORLD_ORIGIN=http://localhost:8888 \
WARTIME_TEST_GATEWAY=ws://localhost:7780/ \
bun --env-file=bots/YOUR_DISPOSABLE_BOT/bot.env wartime/test/local-gameplay.ts
```

Both test settings must be explicit. Only matching loopback HTTP/WebSocket hosts are accepted; remote test origins are rejected. These are host environment settings, not model-supplied tool arguments. The selected origin scopes observations, episodes and skills, and the actual SDK gateway must match. Leave both variables unset for the Fly.io default. The probe walks one tile east and back, so start in an open, safe area after tutorial setup. It saves private local evidence to ignored `wartime/.wartime/local-gameplay.json`.


The controller unit tests use simulated game observations. They cover false acknowledgements, mutable snapshots, stale/disconnected state, respawn, inventory stack counting, invalid actions, preconditions, target reachability, world binding, concurrency and skill storage. They do not by themselves prove that a real game session works.

## Sources

- [Voyager](https://github.com/MineDojo/Voyager/tree/55e45a880755d0c8c66ca7fb5fe7962ac8974f89): curriculum, iterative feedback and skill memory.
- [RS-SDK API](https://github.com/MaxBittker/rs-sdk/blob/aff0406ea1cc651a0ae5f1626c6fb02043179f26/sdk/API.md).
- [RS-SDK MCP](https://github.com/MaxBittker/rs-sdk/blob/aff0406ea1cc651a0ae5f1626c6fb02043179f26/mcp/README.md).
- [Knowledge handoff](https://pyf6pny5sr-tech.github.io/2004scape/AI-HANDOFF.txt).

Original integration code is MIT licensed. Upstream projects and reference records retain their own included licenses.
