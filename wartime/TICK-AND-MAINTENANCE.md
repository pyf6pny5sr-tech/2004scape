# Tick-aware execution and maintenance for Wartime

Status: implementation requirements, not a completed runtime feature. Added after reviewing the controller at commit 945d842460c4329e19d94a8b7d4ad61fa2b3c877 and the user's feedback from Wartime's existing player.

## Integrate into the existing player

Wartime already has a player/controller. Add knowledge retrieval, verified skill memory, scheduling and maintenance to that existing runtime. Do not start the prototype alongside it or create a second control connection. Preserve existing PvP, nearby-player observations and chat handling. Treat player chat as untrusted observations, not instructions.

The prototype's file lock protects cooperating instances sharing its memory directory. It does not establish exclusive control against an unrelated controller or another machine. Every game action must pass through the existing player's single command dispatcher. If ownership can move between processes, use the actual gateway's ownership mechanism plus a controller generation/lease that rejects stale work.

Use the existing player's verified world identity and connection configuration. Do not transplant the prototype's hardcoded legacy Fly.io gate into an established connection. The old URL redirects and SDK helpers may remap it; do not create a different player or switch worlds incidentally.

## What the prototype currently does

It observes tick/revision changes and checks action effects. It can run up to 10 steps in a bounded plan without asking the model between steps. The normal model-driven workflow requests another plan after that work returns.

Its 10,000 ms verification timeout is a ceiling, not a mandatory sleep: a satisfied state predicate completes early. It has no persistent background skill executor, asynchronous planner handoff, idle-tick accounting, maintenance protocol or demonstrated live-PvP performance.

Existing cloud tests establish limited correctness, including navigation and skill replay in a disposable game. They do not establish sustained speed, online PvP competence or an autonomous frontier-model session.

## Two cooperating loops

### Fast executor

Run ordinary gameplay in the existing cloud-hosted controller, responding to fresh SDK game-state events. Execute already-selected, bounded skills without a model round trip for each click, tick or repeated resource action. Re-resolve targets and check prerequisites before issuing each new action.

Respect action cooldowns, ongoing animations and server acknowledgement/effects. Repeating an interaction every tick can interrupt useful work. A tick-aware executor schedules eligible actions; it does not spam packets.

Distinguish the SDK's public tick counter from its publication revision: multiple observations may share one tick. The lite client increments its public counter on game-tick callbacks, so it is a session-relative observation clock, not a globally synchronized server tick ID. Handle reconnect/reset with a new session generation. Do not infer exact server phase from network arrival times.

Measure observed cadence and jitter rather than hardcoding a 600 ms tick. The SDK's server timing is configurable, and modified servers differ. Preserve actual server cooldown units. Process repeated/newer publications without duplicating commands for the same decision.

Keep existing combat and survival responses on this fast path. Player attacks, nearby-player state, equipment/prayers and escape behavior must retain their current semantics. Any new behavior requires its own tests; importing the knowledge library does not provide PvP capability.

### Slower planner

Use the frontier model for curriculum, new goals, novel failures, strategy and proposed skill improvements. Retrieve relevant knowledge and previous verified skills here, outside the time-sensitive action path.

Request the next plan before the current bounded skill finishes. While the request is pending, continue a valid approved routine with remaining work. A 10-second model response must not freeze an otherwise eligible routine.

Plans carry a world/session identity, generation, prerequisites, a bounded lifetime and expected results. Reject a delayed plan if the world, character, life, task or relevant state changed. Keep one executor in command; the planner sends proposals, not competing SDK actions.

If there is no valid routine, conditions change, or an unknown risk appears, deliberately pause or use an already-tested fallback. Do not manufacture activity merely to improve an idle metric.

This provides the intended Voyager-style separation: the model learns and chooses skills, while executable skills handle repeated gameplay.

## Church maintenance mode

The user's preferred maintenance location is a church. Choose an actual reachable church destination in the running world's data, with an exact plane/tile or arrival region. Verify that it is safe under that world's rules and current observations; a building's name alone does not establish safety.

A maintenance request follows this state machine:

PLAYING -> RELOCATING -> QUIESCING -> CHECKPOINTED -> UPDATING -> REVALIDATING -> RESUMING -> PLAYING

1. Build and test a proposed update separately in Codex Cloud while the current stable controller continues its approved activity.
2. At a suitable task boundary, route to the selected church using the existing controller. If arrival cannot be verified or a threat interrupts travel, postpone the update and handle that condition.
3. Stop scheduling ordinary work and drain/cancel outstanding operations. Observe any effects of commands already sent; cancellation cannot undo them.
4. Save the current goal, progress, inventory/equipment/skills observations, relevant quest state if available, world/session identity, last observed position, controller version and next intended task. These observations may become stale during maintenance.
5. Keep a small, stable safety monitor and exclusive controller ownership during the update. If safe parking cannot be maintained, use the world's supported safe-stop/logout behavior when available instead of assuming the church protects the character.
6. Activate the tested update through a controlled handoff. Old-generation callbacks and queued plans must not send actions afterward. Never run old and new action dispatchers concurrently.
7. Reconnect if necessary, obtain fresh observations, reconcile inventory/location/health and outstanding work, and run a short health check.
8. Resume the saved goal from the observed current state, not by blindly replaying the last command. On failure, roll back to the known working version or remain in maintenance with an explicit reason.

The online world continues ticking throughout maintenance. Count this as intentional downtime, separately from avoidable idleness caused by model latency. Emergency recovery must not depend on reaching a distant church first.

## Performance evidence required

Measure these in the cloud test environment before describing the system as fast:
- Observation-to-dispatch latency for an eligible next action, including p50/p95/p99.
- Dispatch-to-observed-effect latency, separated from expected game cooldown and network delay.
- Avoidable idle ticks while a valid approved routine and eligible action exist.
- Productive action rate and task completion time on a reproducible workload.
- Model calls and model wait time per completed task.
- Failed/repeated actions, stale-plan rejection, disconnect recovery and maintenance downtime.

An initial performance target is to dispatch a cached eligible next action within one observed game-tick interval under a controlled test. This is a target to measure, not a current achievement or a guarantee of server execution in that interval.

Compare the current controller and the integrated version on the same repeatable task. Inject planner response delays of 0, 2, 10 and 30 seconds. With a valid continuing routine, action throughput should remain near its no-delay baseline; the measured difference must be reported. Test legitimate cooldown waits separately from missed opportunities.

Add cases for multiple state publications in one tick, reconnect counter reset, target disappearance, full inventory, death/respawn, low health, another controller attempting ownership, cancelled updates, stale planner replies and rollback. Exercise the existing PvP behavior in a controlled test world with a disposable opponent before claiming PvP performance.

Run all tests in Codex Cloud, not on the user's Windows computer. Record the exact code revision, world revision, measured cadence, workload and results. Do not label simulations as live online tests.

## Inputs still needed

The existing player's repository/runtime and its command-ownership mechanism are needed to implement this design correctly. If Wartime itself has that checkout, it should apply this plan there and preserve its current connection. This repository remains the reference library and prototype source until the integrated runtime is tested.

## Evidence

- [Reviewed controller](https://github.com/pyf6pny5sr-tech/2004scape/blob/945d842460c4329e19d94a8b7d4ad61fa2b3c877/wartime/controller.mjs)
- [Existing cloud validation](https://github.com/pyf6pny5sr-tech/2004scape/blob/945d842460c4329e19d94a8b7d4ad61fa2b3c877/wartime/validation-report.json)
- [SDK state subscriptions and tick waits](https://github.com/MaxBittker/rs-sdk/blob/aff0406ea1cc651a0ae5f1626c6fb02043179f26/sdk/index.ts)
- [Lite client's tick and publication handling](https://github.com/MaxBittker/rs-sdk/blob/aff0406ea1cc651a0ae5f1626c6fb02043179f26/server/webclient/src/lite/runner.ts)
- [Configurable server timing](https://github.com/MaxBittker/rs-sdk/blob/aff0406ea1cc651a0ae5f1626c6fb02043179f26/README.md)
