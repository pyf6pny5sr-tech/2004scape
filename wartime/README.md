# Wartime · 2004Scape controller

This is a portable, model-driven integration for https://rs-sdk-demo.fly.dev/:
- the model supplies Voyager-style curriculum, planning and critique;
- the 31,207-record knowledge library supplies cited historical reference material;
- this controller runs bounded RS-SDK actions, checks observed results and stores reusable routines.

It is an original adaptation of Voyager's design, not the upstream Minecraft runtime, and does not train model weights. It does not bundle or select a particular ChatGPT model. The model must have a host that exposes the RS-SDK tools.

## Current status

Development preview. Eleven offline controller tests passed in the original Windows workspace before the user requested further testing exclusively in Codex Cloud. Cloud verification and live integration verification are pending. No game character has been connected by this package.

The supplied Fly.io URL timed out through the research browser. That is not proof the server is offline. Do not silently change the user's target to another server.

## Install in a coding-agent environment

Run these steps on the chosen cloud or agent host. A GitHub Pages website stores reference files; it does not run this controller.

1. Obtain https://github.com/MaxBittker/rs-sdk and follow its setup documentation. The API was checked at commit aff0406ea1cc651a0ae5f1626c6fb02043179f26. If the world requires a newer client, update the SDK and recheck compatibility.
2. Copy this directory into that checkout as `wartime/`, next to `sdk/` and `mcp/`.
3. With Node 24+, run `node wartime/setup-knowledge.mjs`. This downloads the public SQLite knowledge library into `wartime/.wartime/` and verifies its file fingerprint. It neither uploads local files nor connects to the game.
4. Use the SDK's normal bot setup with the intended character name and `--server=rs-sdk-demo.fly.dev`. Keep its generated password in its private `bot.env` file. Never put credentials, character logs or API keys in this public repository.
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

From this directory: `node --test test/*.test.mjs`.

These tests use simulated game observations. They cover false acknowledgements, mutable snapshots, stale/disconnected state, respawn, inventory stack counting, invalid actions, preconditions, target reachability, world binding, concurrency and skill storage. They do not by themselves prove that a real game session works.

## Sources

- [Voyager](https://github.com/MineDojo/Voyager/tree/55e45a880755d0c8c66ca7fb5fe7962ac8974f89): curriculum, iterative feedback and skill memory.
- [RS-SDK API](https://github.com/MaxBittker/rs-sdk/blob/aff0406ea1cc651a0ae5f1626c6fb02043179f26/sdk/API.md).
- [RS-SDK MCP](https://github.com/MaxBittker/rs-sdk/blob/aff0406ea1cc651a0ae5f1626c6fb02043179f26/mcp/README.md).
- [Knowledge handoff](https://pyf6pny5sr-tech.github.io/2004scape/AI-HANDOFF.txt).

Original integration code is MIT licensed. Upstream projects and reference records retain their own included licenses.
