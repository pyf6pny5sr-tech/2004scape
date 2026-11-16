import { validateContinuation, continuationUnsafe, nextContinuation, inside, ordinaryResourceFailure } from "./continuity.mjs";
import { Memory } from "../memory.mjs";
import { Telemetry } from "./telemetry.mjs";
import {
  copy,
  bounded,
  validateCommand,
  expected,
  identity,
} from "./protocol.mjs";
import { randomUUID } from "node:crypto";
import { mkdir, rmdir } from "node:fs/promises";

export class Executor {
  constructor({ adapter, config, policies, memory }) {
    this.adapter = adapter;
    this.config = { maxAgeMs: 3000, ...config };
    this.identity = identity(config);
    this.policies = policies;
    this.policy = policies.get(config.initialVersion ?? "steady-1");
    if (!this.policy) throw new Error("UNKNOWN_TRUSTED_VERSION");
    this.memory =
      memory ??
      new Memory({
        world: this.identity.world,
        player: this.identity.character,
        directory: config.directory,
      });
    bounded(this.config.maxAgeMs, 1, 10000, "STATE_AGE");
    if (config.church) {
      const c = config.church;
      for (const [k, lo, hi] of [
        ["x", 0, 16383],
        ["z", 0, 16383],
        ["level", 0, 3],
        ["radius", 0, 5],
        ["anchorId", 0, 1000000],
        ["anchorRadius", 1, 32],
        ["minHp", 1, 1000],
        ["playerClearance", 0, 32],
      ])
        bounded(c[k], lo, hi, "CHURCH_" + k);
    }
    if (config.safety?.eatAtHp !== undefined)
      bounded(config.safety.eatAtHp, 0, 1000, "EAT_HP");
    this.metrics = new Telemetry();
    this.metrics.count("avoidableIdleTicks", 0);
    this.adapter.metrics = this.metrics;
    this.phase = "STOPPED";
    this.owner = randomUUID();
    this.session = 1;
    this.life = 0;
    this.task = 0;
    this.controller = 1;
    this.queue = [];
    this.proposalIds = new Map();
    this.active = null;
    this.routine = null;
    this.goal = null;
    this.planning = new Map();
    this.requests = [];
    this.events = [];
    this.maintenance = null;
    this.lastTick = null;
    this.lastRevision = null;
    this.tickSerial = 0;
    this.cooldownUntil = 0;
    this.eligibleAt = 0;
    this.staged = new Set();
    this.lastFreshAt = 0;
    this.lastTickTime = null;
    this.stopRequested = false;
    this.blockReason = null;
  }
  event(type, details = {}) {
    this.events.push({ at: Date.now(), type, ...details });
    if (this.events.length > 200) this.events.shift();
  }
  token() {
    return {
      owner: this.owner,
      ...this.identity,
      session: this.session,
      life: this.life,
      task: this.task,
      controller: this.controller,
    };
  }
  same(token) {
    return (
      !!token && Object.entries(this.token()).every(([k, v]) => token[k] === v)
    );
  }
  fresh() {
    const a = this.adapter.age();
    return (
      this.adapter.connected() &&
      this.adapter.controlled() &&
      this.adapter.bound(this.identity) &&
      Number.isFinite(a) &&
      a >= 0 &&
      a <= this.config.maxAgeMs &&
      this.state?.inGame &&
      this.state.player?.hp > 0 &&
      !this.state.player?.isDead
    );
  }
  async start() {
    if (this.phase !== "STOPPED") throw new Error("ALREADY_STARTED");
    await this.memory.initialize();
    // Separate host lease; memory transactions keep their own short-lived lock.
    this.leasePath = this.memory.directory + "/host.lock";
    try {
      await mkdir(this.leasePath, { mode: 0o700 });
    } catch {
      throw new Error("HOST_OWNERSHIP_LOCKED");
    }
    this.leaseHeld = true;
    this.phase = "PLAYING";
    this.stopRequested = false;
    this.unsub = this.adapter.subscribe((s) => this.observe(s));
    this.unconn = this.adapter.onConnection?.((status) => {
      if (status !== "connected")
        this.block(
          status === "preempted"
            ? "OWNERSHIP_PREEMPTED"
            : status === "auth_failed"
              ? "AUTHENTICATION_FAILED"
              : "NETWORK_DISCONNECTED",
        );
    });
    const state = this.adapter.state();
    if (state) this.observe(state);
    this.watchdog = setInterval(() => {
      if(this.active?.continuation && Date.now()>=this.active.expiresAt)this.cancelActive("CONTINUATION_ACTION_EXPIRED");
      if (this.phase !== "STOPPED" && !this.fresh()) {
        if (!["PAUSED", "BLOCKED"].includes(this.phase)) {
          this.invalidate("STALE_OR_DISCONNECTED", { session: true });
          this.phase = "PAUSED";
          this.blockReason = "STALE_OR_DISCONNECTED";
        }
      }
    }, 250);
    this.event("started", { version: this.policy.id });
    return this.status();
  }
  invalidate(reason, { task = false, session = false } = {}) {
    if (task) this.task++;
    if (session) this.session++;
    this.cancelActive(reason);
    this.pendingEmergency = null;
    this.continuation = null;
    this.gatherLease = null;
    if (
      this.maintenance &&
      (this.maintenance.activated ||
        ["PUBLICATION_CLOCK_RESET", "LIFE_CHANGED"].includes(reason))
    )
      this.postpone(reason);
    this.queue = [];
    this.routine = null;
    this.planning.clear();
    this.requests = [];
    this.event("invalidated", { reason });
  }
  cancelActive(reason) {
    if (this.active && !this.active.abort.signal.aborted) {
      this.active.abort.abort(new Error(reason));
      this.metrics.count("cancellations");
    }
  }
  block(reason) {
    if (
      this.phase === "STOPPED" ||
      (this.phase === "BLOCKED" &&
        ["OWNERSHIP_PREEMPTED", "AUTHENTICATION_FAILED"].includes(
          this.blockReason,
        ))
    )
      return;
    this.metrics.count(
      reason === "OWNERSHIP_PREEMPTED"
        ? "preemptions"
        : reason === "AUTHENTICATION_FAILED"
          ? "authFailures"
          : "disconnects",
    );
    this.invalidate(reason, { session: true });
    this.phase = "BLOCKED";
    this.blockReason = reason;
  }
  async stop() {
    if (this.stopRequested) return this.stopDone;
    this.stopRequested = true;
    this.stopDone = this.finishStop();
    return this.stopDone;
  }
  async finishStop() {
    this.invalidate("STOP", { task: true });
    this.phase = "STOPPED";
    clearInterval(this.watchdog);
    this.unsub?.();
    this.unconn?.();
    if (this.active) await this.active.done;
    if (this.maintenance?.work) await this.maintenance.work;
    if (this.persistence) await this.persistence;
    if (this.leaseHeld) {
      await rmdir(this.leasePath);
      this.leaseHeld = false;
    }
    this.event("stopped");
  }
  setGoal(goal) {
    if (
      !goal ||
      typeof goal.description !== "string" ||
      !goal.description.trim() ||
      goal.description.length > 2000
    )
      throw new Error("INVALID_GOAL");
    if (!["PLAYING", "PAUSED"].includes(this.phase) || this.maintenance)
      throw new Error("NOT_PLAYING");
    this.invalidate("TASK_CHANGED", { task: true });
    this.goal = copy(goal);
    this.phase = "PLAYING";
    this.event("goal");
    return this.token();
  }
  submit(proposal) {
    if (this.phase !== "PLAYING" || this.maintenance)
      throw new Error("NOT_ACCEPTING_PLANS");
    if (!proposal || !this.same(proposal.token)) throw new Error("STALE_PLAN");
    if (
      !Number.isFinite(proposal.expiresAt) ||
      proposal.expiresAt <= Date.now() ||
      proposal.expiresAt > Date.now() + 120000
    )
      throw new Error("INVALID_PLAN_LIFETIME");
    if (
      !Array.isArray(proposal.steps) ||
      !proposal.steps.length ||
      proposal.steps.length > 10 ||
      this.queue.length >= 4
    )
      throw new Error("BOUNDED_QUEUE_REQUIRED");
    if (
      typeof proposal.id !== "string" ||
      !/^[a-zA-Z0-9_-]{1,80}$/.test(proposal.id)
    )
      throw new Error("PROPOSAL_ID_REQUIRED");
    const key = JSON.stringify([this.token(), proposal.id]);
    if (this.proposalIds.has(key)) throw new Error("DUPLICATE_PROPOSAL");
    const steps = proposal.steps.map(validateCommand);
    const repeat = bounded(proposal.repeat ?? 1, 1, 20, "REPEAT");
    const continuation = proposal.continuation ? validateContinuation(proposal.continuation, this.state, this.token()) : null;
    if(continuation && steps.some(c=>!(['chop','burn_logs','walk'].includes(c.action))||(c.action==='chop'&&c.target.name!==continuation.target.name)||(c.action==='burn_logs'&&c.item.name!==continuation.log.name)||(c.action==='walk'&&!inside(continuation.area,{worldX:c.x,worldZ:c.z,level:c.level}))))throw Error('CONTINUATION_INCOMPATIBLE_STEP');
    const routine = {
      id: randomUUID(),
      token: copy(proposal.token),
      expiresAt: proposal.expiresAt,
      steps,
      repeat,
      index: 0,
      cycle: 0,
      results: [],
      recordIds: (proposal.recordIds ?? [])
        .filter((x) => typeof x === "string")
        .slice(0, 30),
    };
    for (const [id, expiry] of this.proposalIds)
      if (expiry < Date.now()) this.proposalIds.delete(id);
    if (this.proposalIds.size >= 1000)
      throw new Error("DEDUPLICATION_CAPACITY");
    this.proposalIds.set(key, proposal.expiresAt);
    this.continuation = continuation;
    if (continuation) this.metrics.count("continuationApprovals");
    this.blockReason = null;
    this.queue.push(routine);
    this.event("plan_accepted", { id: routine.id });
    this.schedule();
    return { id: routine.id };
  }
  requestPlan(context = {}) {
    if (this.requests.length >= 2) throw new Error("PLANNER_QUEUE_FULL");
    const id = randomUUID();
    const request = {
      id,
      token: this.token(),
      requestedAt: Date.now(),
      context: copy(context),
    };
    this.planning.set(id, { ...request, started: performance.now() });
    this.requests.push(request);
    this.event("planner_requested", { id });
    return copy(request);
  }
  plannerRequests() {
    return copy(this.requests);
  }
  completePlan(id, proposal, source = "unspecified_caller") {
    const p = this.planning.get(id);
    if (!p) throw new Error("STALE_PLANNER_REQUEST");
    const turnaroundMs = performance.now() - p.started;
    this.metrics.add("plannerRequestMs", turnaroundMs);
    this.metrics.add("plannerTurnaroundMs", turnaroundMs);
    this.event("planner_response", {
      id,
      source,
      turnaroundMs,
      isolatedInferenceTime: false,
    });
    this.planning.delete(id);
    this.requests = this.requests.filter((r) => r.id !== id);
    if (!this.same(p.token)) throw new Error("STALE_PLANNER_REQUEST");
    const result = proposal
      ? this.submit({ ...proposal, token: p.token })
      : { accepted: false };
    if (proposal && source === "current_agent_tools")
      this.metrics.count("currentAgentToolPlansAccepted");
    return result;
  }
  async planWith(provider, context) {
    const r = this.requestPlan(context);
    try {
      const proposal = await provider(r);
      return this.completePlan(r.id, proposal, "optional_provider");
    } catch (e) {
      this.planning.delete(r.id);
      this.requests = this.requests.filter((x) => x.id !== r.id);
      this.metrics.count("plannerFailures");
      throw e;
    }
  }
  observe(input) {
    if (this.phase === "STOPPED") return;
    const previous = this.state;
    const s = copy(input),
      now = performance.now();
    const tick = s.tick,
      revision = s.revision;
    if (!Number.isFinite(tick)) return;
    const reset =
      this.lastTick !== null &&
      (tick < this.lastTick ||
        (revision !== undefined &&
          this.lastRevision !== null &&
          revision < this.lastRevision));
    if (reset) {
      this.invalidate("PUBLICATION_CLOCK_RESET", { session: true });
      this.cooldownUntil = 0;
      this.lastTickTime = null;
    }
    if (
      !reset &&
      this.lastRevision !== null &&
      revision !== undefined &&
      revision <= this.lastRevision
    ) {
      this.metrics.count("duplicatePublications");
      return;
    }
    const newTick = reset || tick !== this.lastTick;
    if (newTick) {
      if (this.lastTickTime !== null) {
        this.metrics.add("tickCadenceMs", now - this.lastTickTime);
        const samples = this.metrics.samples.tickCadenceMs;
        if (samples.length > 1)
          this.metrics.add(
            "tickJitterMs",
            Math.abs(samples.at(-1) - samples.at(-2)),
          );
      }
      this.lastTickTime = now;
      this.tickSerial++;
    }
    this.lastTick = tick;
    this.lastRevision = revision ?? null;
    this.state = s;
    this.observedAt = now;
    let observedProgress = false;
    if (previous) {
      const totals = (items) => {
        const m = new Map();
        for (const i of items ?? []) m.set(i.id, (m.get(i.id) ?? 0) + i.count);
        return m;
      };
      const before = totals(previous.inventory),
        after = totals(s.inventory);
      const itemGain = [...after].reduce(
        (n, [id, count]) => n + Math.max(0, count - (before.get(id) ?? 0)),
        0,
      );
      const xpGain = (s.skills ?? []).reduce(
        (n, skill) =>
          n +
          Math.max(
            0,
            skill.experience -
              (previous.skills ?? []).find((x) => x.name === skill.name)
                ?.experience || 0,
          ),
        0,
      );
      const moved =
        s.player?.worldX !== previous.player?.worldX ||
        s.player?.worldZ !== previous.player?.worldZ;
      observedProgress = itemGain > 0 || xpGain > 0 || moved;
      if (observedProgress) this.metrics.count("observedProgressPublications");
      if (
        (itemGain > 0 || xpGain > 0) &&
        (this.active?.gathering || this.gatherLease)
      ) {
        this.metrics.count("observedGatherProgressPublications");
        this.event("gather_progress", {
          tick: s.tick,
          revision: s.revision,
          itemGain,
          xpGain,
        });
      }
    }
    if (newTick && this.active) {
      this.metrics.count("helperPendingTicks");
      if (!observedProgress)
        this.metrics.count("helperPendingWithoutObservedProgressTicks");
    }
    if (newTick && s.player?.animId !== undefined && s.player.animId !== -1)
      this.metrics.count("animationObservedTicks");
    if (this.life !== 0 && this.life !== s.player?.lifeId) {
      this.invalidate("LIFE_CHANGED", { session: true });
      this.cooldownUntil = 0;
      this.phase = "PAUSED";
      this.blockReason = "REPLAN_AFTER_RESPAWN";
    }
    this.life = s.player?.lifeId ?? 0;
    if (!this.adapter.bound(this.identity)) {
      this.block("WORLD_OR_CHARACTER_CHANGED");
      return;
    }
    if (!this.fresh()) {
      this.cancelActive("UNSAFE_STATE");
      if (this.maintenance) this.postpone("UNSAFE_OR_STALE");
      return;
    }
    this.lastFreshAt = now;
    if(this.active?.continuation){
      const unsafe=continuationUnsafe(this.active.grant,this.state);
      if(unsafe){this.invalidate(unsafe,{task:true});this.phase='PAUSED';this.blockReason=unsafe;if(this.state.player.hp<=(this.config.safety?.eatAtHp??0))this.emergency();return;}
      if(Date.now()>=this.active.expiresAt)this.cancelActive('CONTINUATION_ACTION_EXPIRED');
    }
    if (this.continuation) {
      const unsafe = continuationUnsafe(this.continuation, this.state);
      if (unsafe) { this.invalidate(unsafe, {task:true}); this.phase='PAUSED'; this.blockReason=unsafe; if(this.state.player.hp<=(this.config.safety?.eatAtHp??0))this.emergency(); return; }
      if (this.continuation.expiresAt <= Date.now()) {
        this.continuation=null; this.metrics.count('continuationExpirations');
        if(this.active?.continuation)this.cancelActive('CONTINUATION_EXPIRED');
      }
    }
    if (this.phase === "BLOCKED") return;
    if (this.state.player.hp <= (this.config.safety?.eatAtHp ?? 0)) {
      if ((this.emergencyAttempts ?? 0) < 3) this.emergency();
    } else this.emergencyAttempts = 0;
    if (this.phase === "PAUSED") return;
    if (this.maintenance && this.phase === "EMERGENCY") {
      this.schedule();
      return;
    }
    if (this.maintenance) {
      if (newTick) this.metrics.count("intentionalMaintenanceTicks");
      this.advanceMaintenance();
      return;
    }
    if (newTick) {
      if (this.active) this.metrics.count("ongoingActionTicks");
      else if (this.tickSerial < this.cooldownUntil)
        this.metrics.count("cooldownTicks");
      else if (this.routine || this.queue.length)
        this.metrics.count("eligibleTicks");
      else
        this.metrics.count(
          this.planning.size ? "plannerStarvedTicks" : "noApprovedRoutineTicks",
        );
    }
    this.schedule();
    if (newTick && this.phase === "PLAYING" && !this.active && this.routine) {
      try {
        if (!this.eligibility(this.routine.steps[this.routine.index]))
          this.metrics.count("avoidableIdleTicks");
      } catch {}
    }
  }
  emergency() {
    if (this.phase === "EMERGENCY") return;
    this.emergencyAttempts = (this.emergencyAttempts ?? 0) + 1;
    this.metrics.count("emergencies");
    this.invalidate("HEALTH_EMERGENCY", { task: true });
    if (this.maintenance) this.postpone("HEALTH_EMERGENCY");
    this.phase = "EMERGENCY";
    const safety = this.config.safety ?? {};
    let command;
    const food = this.state.inventory?.find((i) =>
      i.optionsWithIndex?.some((o) => o.text.toLowerCase() === "eat"),
    );
    if (food)
      command = {
        action: "eat",
        target: { id: food.id },
        expect: [{ type: "hp_gain", amount: 1 }],
        cooldownTicks: 3,
      };
    else if (safety.escape)
      command = {
        action: "escape",
        ...safety.escape,
        expect: [{ type: "position", ...safety.escape }],
        cooldownTicks: 1,
      };
    if (!command) {
      this.phase = "PAUSED";
      this.blockReason = "EMERGENCY_NO_APPROVED_FALLBACK";
      return;
    }
    // The prior action must unwind before the safety action owns dispatch.
    this.pendingEmergency = validateCommand(command);
    this.event("emergency");
    this.schedule();
  }
  gatherMatches(c) {
    const g = this.gatherLease;
    return (
      !!g &&
      this.same(g.token) &&
      g.action === c.action &&
      (c.target.id === undefined || c.target.id === g.target.id) &&
      (c.target.x === undefined || (c.target.x===g.target.x&&c.target.z===g.target.z)) &&
      (c.target.name === undefined ||
        c.target.name.toLowerCase() === g.target.name.toLowerCase())
    );
  }
  gatherPresent() {
    const g = this.gatherLease;
    return (
      !!g &&
      this.state.nearbyLocs?.some(
        (l) =>
          l.id === g.target.id &&
          l.x === g.target.x &&
          l.z === g.target.z &&
          l.level === g.target.level,
      )
    );
  }
  consumeGatherEffect(c, r) {
    if (!this.gatherMatches(c)) return false;
    const g = this.gatherLease;
    if (
      c.expect.some((e) => e.type === "inventory_gain") &&
      c.expect.every(
        (e) =>
          ["inventory_gain", "xp_gain"].includes(e.type) &&
          expected(e, g.baseline, this.state),
      )
    ) {
      this.advanceRoutine(r, {
        status: "verified",
        action: c.action,
        verification: "continued_owned_gather",
        before: copy(g.baseline),
        after: copy(this.state),
      });
      g.baseline = copy(this.state);
      this.metrics.count("continuedGatherEffects");
      this.event("continued_gather_effect", { action: c.action });
      queueMicrotask(() => this.schedule());
      return true;
    }
    return false;
  }
  eligibility(c) {
    const s = this.state;
    if (this.gatherMatches(c)) {
      if (!this.gatherPresent()) this.gatherLease = null;
      else if (s.player.animId !== -1) {
        this.metrics.count("gatherInteractionSuppressions");
        return "GATHER_CONTINUING";
      } else throw new Error("GATHER_CONTINUATION_UNCERTAIN_REPLAN");
    }
    if (this.tickSerial < this.cooldownUntil) return "COOLDOWN";
    if (
      !["eat", "escape", "prayer_on", "prayer_off"].includes(c.action) &&
      s.player.animId !== undefined &&
      s.player.animId !== -1 &&
      !this.policy.allowBusy
    )
      return "ANIMATION";
    if (
      ["chop", "mine", "pickup"].includes(c.action) &&
      s.inventory?.length >= 28
    )
      throw new Error("FULL_INVENTORY");
    for (const p of c.preconditions ?? []) {
      let ok = false;
      if (p.type === "inventory_at_least")
        ok =
          (s.inventory ?? [])
            .filter(
              (i) =>
                (p.item.id === undefined || i.id === p.item.id) &&
                (p.item.name === undefined ||
                  i.name.toLowerCase() === p.item.name.toLowerCase()),
            )
            .reduce((a, i) => a + i.count, 0) >= p.amount;
      if (p.type === "hp_at_least") ok = s.player.hp >= p.amount;
      if (p.type === "skill_at_least")
        ok = s.skills?.some(
          (x) =>
            x.name.toLowerCase() === p.skill.toLowerCase() &&
            x.baseLevel >= p.level,
        );
      if (!ok) throw new Error("PRECONDITION_FAILED");
    }
    return null;
  }
  schedule() {
    if (
      this.active ||
      this.stopRequested ||
      !this.fresh() ||
      ["STOPPED", "BLOCKED", "PAUSED"].includes(this.phase)
    )
      return;
    if (this.pendingEmergency) {
      if (this.tickSerial < (this.safetyCooldownUntil ?? 0)) return;
      const c = this.pendingEmergency;
      this.pendingEmergency = null;
      this.launch(c, null, "emergency");
      return;
    }
    if (this.maintenance) return;
    if (this.phase !== "PLAYING") return;
    if (this.routine?.continuation && this.queue.length && !this.active) this.routine=null;
    if (!this.routine) this.routine = this.queue.shift() ?? null;
    if (!this.routine && this.continuation) this.refillContinuation();
    const r = this.routine;
    if (!r) { this.ensureRefillRequest(); return; }
    if (!this.same(r.token) || r.expiresAt < Date.now()) {
      this.metrics.count("staleRoutines");
      this.routine = null;
      this.schedule();
      return;
    }
    if (
      !this.planning.size &&
      r.index >= Math.max(0, r.steps.length - 2) &&
      this.requests.length < 2
    )
      this.requestPlan({ reason: "prefetch", routine: r.id });
    let c = r.steps[r.index];
    if (this.consumeGatherEffect(c, r)) return;
    try {
      const wait = this.eligibility(c);
      if (wait) {
        this.metrics.count(
          wait === "COOLDOWN" ? "cooldownDecisions" : "animationWaitDecisions",
        );
        return;
      }
    } catch (e) {
      this.finishFailure(r, e.message, ordinaryResourceFailure(e.message));
      return;
    }
    if (
      c.expect.every(
        (e) =>
          [
            "position",
            "bank_open",
            "equipped",
            "prayer",
            "combat_target",
            "combat_style",
          ].includes(e.type) && expected(e, this.state, this.state),
      )
    ) {
      this.advanceRoutine(r, {
        status: "already_satisfied",
        action: c.action,
        before: copy(this.state),
        after: copy(this.state),
      });
      queueMicrotask(() => this.schedule());
      return;
    }
    this.launch(c, r, "routine");
  }
  ensureRefillRequest() {
    if(this.phase==='PLAYING'&&!this.maintenance&&!this.planning.size&&this.requests.length<2)
      this.requestPlan({reason:'approved_runway_refill',continuation:this.continuationStatus()});
  }
  continuationStatus() {
    const g=this.continuation;
    return g?{recipe:g.recipe,remainingActions:g.remaining,expiresAt:g.expiresAt,runwayMs:Math.max(0,g.expiresAt-Date.now()),failures:g.failures,backoffTicks:Math.max(0,(g.retryAt??0)-this.tickSerial),area:copy(g.area)}:null;
  }
  refillContinuation() {
    const g=this.continuation;
    if(!g||!this.same(g.token)||g.expiresAt<=Date.now()||g.remaining<=0){this.continuation=null;return;}
    if(!this.planning.size)this.ensureRefillRequest();
    if(this.tickSerial<(g.retryAt??0))return;
    const unsafe=continuationUnsafe(g,this.state);if(unsafe){this.continuation=null;this.phase='PAUSED';this.blockReason=unsafe;return;}
    const choice=nextContinuation(g,this.state,this.tickSerial);
    if(choice.reason){this.continuation=null;this.phase='PAUSED';this.blockReason=choice.reason;this.event('continuation_yielded',{reason:choice.reason});return;}
    const command=validateCommand(choice.command);g.remaining--;
    this.routine={id:randomUUID(),token:this.token(),expiresAt:g.expiresAt,steps:[command],repeat:1,index:0,cycle:0,results:[],recordIds:[],continuation:true,continuationId:g.id};
    this.metrics.count('continuationActionsGenerated');
  }
  launch(c, r, kind) {
    const grantAtLaunch = r?.continuation ? this.continuation : null;
    const token = this.token(),
      before = copy(this.state),
      received = this.adapter.receivedAt(),
      abort = new AbortController(),
      started = performance.now();
    const active = {
      token,
      abort,
      kind,
      gathering: ["chop", "mine"].includes(c.action),
      continuation: !!r?.continuation,
      grant: grantAtLaunch,
      expiresAt: r?.expiresAt ?? Infinity,
      done: null,
    };
    if (!active.gathering) this.gatherLease = null;
    this.active = active;
    this.metrics.add("observationToDispatchMs", started - this.observedAt);
    this.metrics.add("publicationAgeAtDispatchMs", this.adapter.age());
    this.metrics.count("dispatches");
    if(this.planning.size)this.metrics.count("dispatchesWhilePlannerPending");
    this.cooldownUntil =
      this.tickSerial +
      Math.max(c.cooldownTicks ?? 1, this.policy.minCooldownTicks);
    if (kind === "emergency")
      this.safetyCooldownUntil = this.tickSerial + (c.cooldownTicks ?? 1);
    this.event("dispatch", {
      action: c.action,
      kind,
      version: this.policy.id,
      plannerPending: this.planning.size > 0,
    });
    active.done = (async () => {
      let status = "failed",
        ordinaryRecoverable = false,
        reason = null,
        after;
      try {
        // Adapter establishes its own async cancellation context. Every packet is guarded.
        const result = await this.adapter.execute(
          c,
          before,
          abort.signal,
          () =>
            !abort.signal.aborted &&
            this.same(token) &&
            this.fresh() &&
            (!r || r.expiresAt > Date.now()) &&
            this.phase !== "BLOCKED" && (!r?.continuation || (grantAtLaunch && !continuationUnsafe(grantAtLaunch,this.state))),
        );
        if (abort.signal.aborted || !this.same(token) || (r&&r.expiresAt<=Date.now()))
          throw new Error("OLD_GENERATION");
        if (result?.success === false && ['chop','mine','burn_logs','walk'].includes(c.action)) {
          ordinaryRecoverable=ordinaryResourceFailure(result.reason,result.message);
          const observed=this.adapter.state();
          if(ordinaryRecoverable&&(!r||r.expiresAt>Date.now())&&(!grantAtLaunch||!continuationUnsafe(grantAtLaunch,this.state))&&this.fresh()&&this.adapter.receivedAt()>received&&observed.player?.lifeId===before.player.lifeId&&c.expect.every(e=>expected(e,before,observed))) {
            this.event('effect_reconciled',{action:c.action});this.metrics.count('helperFailuresReconciledByFreshEffect');
          } else throw new Error('SDK_ACTION_FAILED');
        } else if (result?.success === false) {
          const known = [
            "not_attackable",
            "out_of_reach",
            "cant_reach",
            "no_attack_option",
            "timeout",
            "inventory_full",
          ];
          const reason = known.includes(result.reason)
            ? "SDK_" + result.reason.toUpperCase()
            : "SDK_ACTION_FAILED";
          this.event("action_refused", { action: c.action, reason });
          throw new Error(reason);
        }
        after = await this.adapter.verify(
          (s) =>
            this.fresh() &&
            this.same(token) &&
            s.player?.lifeId === before.player.lifeId &&
            (!r || r.expiresAt>Date.now()) && (!grantAtLaunch || !continuationUnsafe(grantAtLaunch,s)) &&
            this.adapter.receivedAt() > received &&
            c.expect.every((e) => expected(e, before, s)),
          c.timeoutMs ?? 15000,
          abort.signal,
        );
        if (abort.signal.aborted || !this.same(token) || (r&&r.expiresAt<=Date.now()))
          throw new Error("OLD_GENERATION");
        if (
          ["attack_player", "attack_npc"].includes(c.action) &&
          !c.expect.some(
            (e) =>
              e.type === "xp_gain" &&
              [
                "attack",
                "strength",
                "defence",
                "hitpoints",
                "ranged",
                "magic",
              ].includes(e.skill.toLowerCase()),
          )
        )
          throw new Error("COMBAT_TARGET_ONLY_IS_NOT_SERVER_ACCEPTANCE");
        status = "verified";
        this.cooldownUntil = Math.max(
          this.cooldownUntil,
          this.tickSerial +
            Math.max(c.cooldownTicks ?? 1, this.policy.minCooldownTicks),
        );
        this.metrics.add("actionToEffectMs", performance.now() - started);
        this.metrics.count("verifiedActions");
      } catch (e) {
        reason = abort.signal.aborted ? "CANCELLED" : String(e.message);
        ordinaryRecoverable ||= ordinaryResourceFailure(reason);
        const observed=this.adapter.state();
        if(ordinaryRecoverable&&!abort.signal.aborted&&this.same(token)&&(!r||r.expiresAt>Date.now())&&(!grantAtLaunch||!continuationUnsafe(grantAtLaunch,this.state))&&this.fresh()&&['chop','mine','burn_logs','walk'].includes(c.action)&&this.adapter.receivedAt()>received&&observed.player?.lifeId===before.player.lifeId&&c.expect.every(x=>expected(x,before,observed))) {
          after=copy(observed);status='verified';reason=null;
          this.cooldownUntil=Math.max(this.cooldownUntil,this.tickSerial+Math.max(c.cooldownTicks??1,this.policy.minCooldownTicks));
          this.metrics.count('verifiedActions');this.metrics.count('helperFailuresReconciledByFreshEffect');this.metrics.add('actionToEffectMs',performance.now()-started);
          this.event('effect_reconciled',{action:c.action});
        } else this.metrics.count("failures");
      }
      if (this.active !== active) return;
      this.active = null;
      if (this.same(token) && !abort.signal.aborted) {
        if (r) {
          const result = {
            status,
            action: c.action,
            reason,
            before: copy(before),
            after: after ? copy(after) : null,
          };
          if (status === "verified") {
            if(this.continuation&&(!r.continuation||r.continuationId===this.continuation.id)){this.continuation.consecutiveFailures=0;if(c.action==='walk')this.continuation.relocate=false;}
            if(this.planning.size)this.metrics.count('verifiedActionsWhilePlannerPending');
            if (active.gathering) {
              const target = (before.nearbyLocs ?? [])
                .filter(
                  (l) =>
                    l.level === before.player.level &&
                    l.reachable !== false &&
                    (c.target.id === undefined || l.id === c.target.id) &&
                    (c.target.x === undefined || (l.x===c.target.x&&l.z===c.target.z)) &&
                    (c.target.name === undefined ||
                      l.name.toLowerCase() === c.target.name.toLowerCase()),
                )
                .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0))[0];
              if (target)
                this.gatherLease = {
                  token: copy(token),
                  action: c.action,
                  target: copy(target),
                  baseline: copy(after),
                };
            }
            this.advanceRoutine(r, result);
          } else {
            r.results.push(result);
            this.finishFailure(r, reason, ordinaryRecoverable);
          }
        }
        if (kind === "emergency") {
          this.phase = "PAUSED";
          this.blockReason =
            status === "verified"
              ? "REPLAN_AFTER_EMERGENCY"
              : "EMERGENCY_FAILED";
        }
      }
      if (this.pendingEmergency) this.schedule();
      else if (this.maintenance) this.advanceMaintenance();
      else this.schedule();
    })();
  }
  finishFailure(r, reason, ordinaryRecoverable = false) {
    const queued = this.queue;
    this.routine = null;
    this.queue = [];
    this.phase = "PAUSED";
    this.blockReason = reason;
    const g=this.continuation,c=r?.steps[r.index];
    if(ordinaryRecoverable&&g&&this.same(g.token)&&this.fresh()&&!continuationUnsafe(g,this.state)&&g.remaining>0&&g.expiresAt>Date.now()&&['chop','burn_logs','walk'].includes(c?.action)&&
       (r.continuation||(['chop','burn_logs'].includes(c.action)))&&g.consecutiveFailures<2&&g.failures<6&&reason!=='PRECONDITION_FAILED') {
      if(r.continuation&&r.continuationId!==g.id){this.queue=queued;this.phase='PLAYING';this.event('retired_continuation_yielded');if(r)this.recordRoutine(r).catch(()=>{});return;}
      g.failures++;g.consecutiveFailures++;g.retryAt=this.tickSerial+2**g.consecutiveFailures;
      if(c.action==='burn_logs')g.relocate=true;
      if(c.action==='chop'&&c.target.x!==undefined)g.blockedTargets.push({x:c.target.x,z:c.target.z,until:this.tickSerial+12});
      if(c.action==='walk')g.blockedTiles.push({x:c.x,z:c.z});
      this.gatherLease=null;this.phase='PLAYING';
      if(r.continuation&&queued.length){this.queue=queued;this.metrics.count('continuationYieldToQueuedPlan');}
      this.metrics.count('boundedContinuationRecoveries');
      this.event('continuation_recovery',{action:c.action,reason,backoffTicks:2**g.consecutiveFailures});this.ensureRefillRequest();
    } else if(g) this.continuation=null;
    this.event("routine_failed", { reason });
    if (r) this.recordRoutine(r).catch(() => {});
  }
  advanceRoutine(r, result) {
    r.results.push(result);
    r.index++;
    if (r.index === r.steps.length) {
      r.index = 0;
      r.cycle++;
      this.metrics.count("routineCycles");
      if (r.cycle >= r.repeat) {
        this.routine = null;
        this.recordRoutine(r).catch(() => {
          if (!this.stopRequested) {
            this.blockReason = "PERSISTENCE_FAILED";
            this.phase = "PAUSED";
          }
        });
      }
    }
  }
  async recordRoutine(r) {
    const verified =
      r.results.length === r.steps.length * r.repeat &&
      r.results.every((s) => s.status === "verified");
    const value = {
      routineId: r.id,
      status: verified ? "verified" : "needs_replan",
      plan: {
        goal: this.goal?.description ?? "Approved routine",
        steps: r.steps,
        repeat: r.repeat,
        recordIds: r.recordIds,
      },
      steps: copy(r.results),
    };
    this.persistence = (this.persistence ?? Promise.resolve()).then(
      async () => {
        const episode = await this.memory.record(value);
        this.lastEpisode = episode.id;
        this.lastEpisodeRoutineId = r.id;
        this.metrics.count("episodes");
        this.event("episode", { id: episode.id, status: episode.status });
        return episode;
      },
    );
    return this.persistence;
  }

  async replay(name) {
    const skill = await this.memory.skill(name);
    if (
      skill.world !== this.identity.world ||
      skill.player !== this.identity.character
    )
      throw new Error("WRONG_SKILL_SCOPE");
    return this.submit({
      id: randomUUID(),
      token: this.token(),
      expiresAt: Date.now() + 60000,
      steps: skill.plan.steps,
      repeat: skill.plan.repeat ?? 1,
      recordIds: skill.plan.recordIds,
    });
  }
  async remember(name, id, description) {
    return this.memory.remember(name, id, description);
  }
  status() {
    const s = this.state;
    return {
      identity: this.identity,
      token: this.token(),
      phase: this.phase,
      reason: this.blockReason,
      version: this.policy.id,
      goal: this.goal,
      routine: this.routine
        ? {
            id: this.routine.id,
            index: this.routine.index,
            cycle: this.routine.cycle,
            repeat: this.routine.repeat,
          }
        : null,
      queueLength: this.queue.length,
      active: this.active?.kind ?? null,
      continuation: this.continuationStatus(),
      lastEpisode: this.lastEpisode ?? null,
      lastEpisodeRoutineId: this.lastEpisodeRoutineId ?? null,
      maintenance: this.maintenance
        ? {
            stage: this.maintenance.stage,
            reason: this.maintenance.reason,
            version: this.maintenance.version,
          }
        : null,
      observation: s
        ? {
            tick: s.tick,
            revision: s.revision,
            player: copy(s.player),
            inventory: copy(s.inventory ?? []),
            equipment: copy(s.equipment ?? []),
            skills: copy(s.skills ?? []),
            nearbyNpcs: copy((s.nearbyNpcs ?? []).slice(0, 100)),
            nearbyPlayers: copy((s.nearbyPlayers ?? []).slice(0, 50)),
            nearbyLocs: copy((s.nearbyLocs ?? []).slice(0, 100)),
            groundItems: copy((s.groundItems ?? []).slice(0, 100)),
            chat: {
              trust: "UNTRUSTED_GAME_DATA",
              messages: copy(
                (s.gameMessages ?? []).slice(-20).map((m) => ({
                  type: m.type,
                  text: String(m.text).slice(0, 400),
                  sender: String(m.sender ?? "").slice(0, 30),
                  tick: m.tick,
                })),
              ),
            },
            dialog: copy(s.dialog),
            prayers: copy(s.prayers),
            knowledgeBaseline: "Historical revision 274; not live mechanics",
          }
        : null,
      metrics: this.metrics.report(),
      events: copy(this.events),
    };
  }
  stage(version) {
    if (!this.policies.has(version))
      throw new Error("VERSION_NOT_IN_TRUSTED_REGISTRY");
    this.staged.add(version);
    return { version };
  }
  churchFailure() {
    const c = this.config.church,
      s = this.state;
    if (!c?.operatorVerifiedWorldRules) return "CHURCH_WORLD_RULES_UNVERIFIED";
    if (!this.fresh()) return "CHURCH_STALE_STATE";
    if (
      s.player.level !== c.level ||
      Math.abs(s.player.worldX - c.x) > c.radius ||
      Math.abs(s.player.worldZ - c.z) > c.radius
    )
      return "CHURCH_OUTSIDE_ARRIVAL_REGION";
    if (s.player.combat?.inCombat) return "CHURCH_COMBAT_ACTIVE";
    if (s.player.hp < c.minHp) return "CHURCH_HEALTH_TOO_LOW";
    if (
      (s.nearbyNpcs ?? []).some(
        (n) => n.inCombat && n.distance <= c.playerClearance,
      )
    )
      return "CHURCH_NEARBY_NPC_COMBAT";
    if ((s.nearbyPlayers ?? []).some((p) => p.distance <= c.playerClearance))
      return "CHURCH_PLAYER_NEARBY";
    if (
      !s.nearbyLocs?.some(
        (l) =>
          l.id === c.anchorId &&
          l.level === c.level &&
          Math.abs(l.x - c.x) <= c.anchorRadius &&
          Math.abs(l.z - c.z) <= c.anchorRadius,
      )
    )
      return "CHURCH_ANCHOR_NOT_OBSERVED";
    return null;
  }
  churchSafe() {
    return this.churchFailure() === null;
  }
  requestMaintenance(version) {
    if (
      this.phase !== "PLAYING" ||
      this.maintenance ||
      !this.staged.has(version) ||
      !this.config.church
    )
      throw new Error("MAINTENANCE_NOT_READY");
    const saved = {
      goal: copy(this.goal),
      continuation: copy(this.continuation),
      routine: this.routine
        ? { ...copy(this.routine), inFlight: !!this.active }
        : null,
      queue: copy(this.queue),
    };
    this.invalidate("MAINTENANCE", { task: true });
    this.maintenance = {
      stage: "REQUESTED",
      version,
      previous: this.policy.id,
      saved,
      started: performance.now(),
      received: this.adapter.receivedAt(),
      deadline: performance.now() + 60000,
    };
    this.event("maintenance_requested", { version });
    this.advanceMaintenance();
    return this.status();
  }
  postpone(reason) {
    if (
      !this.maintenance ||
      ["POSTPONED", "CANCELLED"].includes(this.maintenance.stage)
    )
      return;
    if (this.maintenance.activated) {
      this.rollbackMaintenance(reason);
      return;
    }
    this.maintenance.reason = reason;
    this.maintenance.stage = "POSTPONED";
    this.phase = "PAUSED";
    this.blockReason = reason;
    this.event("maintenance_postponed", { reason });
  }
  cancelMaintenance() {
    if (!this.maintenance) throw new Error("NO_MAINTENANCE");
    if (this.maintenance.activated)
      this.rollbackMaintenance("MAINTENANCE_CANCELLED_REPLAN");
    else {
      this.policy = this.policies.get(this.maintenance.previous);
      this.controller++;
    }
    this.invalidate("MAINTENANCE_CANCELLED");
    this.maintenance.stage = "CANCELLED";
    this.phase = "PAUSED";
    this.blockReason = "MAINTENANCE_CANCELLED_REPLAN";
    this.event("maintenance_cancelled");
  }
  resume() {
    if (!["PAUSED", "BLOCKED"].includes(this.phase) || !this.fresh())
      throw new Error("FRESH_OWNED_STATE_REQUIRED");
    if (this.phase === "BLOCKED")
      throw new Error("NEW_EXPLICIT_HANDOFF_REQUIRED");
    this.maintenance = null;
    this.invalidate("EXPLICIT_RESUME", { task: true });
    this.phase = "PLAYING";
    this.blockReason = null;
    return this.token();
  }
  advanceMaintenance() {
    const m = this.maintenance;
    if (!m || ["POSTPONED", "CANCELLED"].includes(m.stage)) return;
    if (performance.now() > m.deadline) {
      this.postpone("MAINTENANCE_DEADLINE");
      return;
    }
    if (!this.fresh() || this.state.player.combat?.inCombat) {
      this.cancelActive("MAINTENANCE_UNSAFE");
      this.postpone("UNSAFE_OR_STALE");
      return;
    }
    if (m.busy || this.active) return;
    const c = this.config.church;
    if (m.stage === "REQUESTED") {
      m.stage = "RELOCATING";
      this.phase = "RELOCATING";
      if (!this.churchSafe()) {
        if (this.state.player.level !== c.level) {
          this.postpone("CHURCH_PLANE_REQUIRES_APPROVED_ROUTE");
          return;
        }
        this.launch(
          validateCommand({
            action: "walk",
            x: c.x,
            z: c.z,
            level: c.level,
            tolerance: c.radius,
            expect: [
              {
                type: "position",
                x: c.x,
                z: c.z,
                level: c.level,
                tolerance: c.radius,
              },
            ],
            timeoutMs: 30000,
          }),
          null,
          "maintenance-route",
        );
        return;
      }
    }
    if (m.stage === "RELOCATING") {
      if (!this.churchSafe()) {
        this.postpone(this.churchFailure());
        return;
      }
      m.stage = "QUIESCING";
      m.quiet = 0;
      m.lastQuietTick = this.tickSerial;
      m.lastQuietPublicTick = this.lastTick;
      m.received = this.adapter.receivedAt();
      this.event("church_verified");
      return;
    }
    if (m.stage === "QUIESCING") {
      if (!this.churchSafe()) {
        this.postpone(this.churchFailure());
        return;
      }
      // Count only consecutive fresh idle game ticks after arrival/drain.
      // A busy publication resets the streak, even within an already-seen tick.
      if (
        this.state.player.animId !== -1 ||
        this.adapter.receivedAt() <= m.received
      ) {
        m.quiet = 0;
        m.lastQuietTick = this.tickSerial;
        m.lastQuietPublicTick = this.lastTick;
        return;
      }
      if (m.lastQuietTick === this.tickSerial) return;
      m.quiet =
        m.lastQuietTick === this.tickSerial - 1 &&
        m.lastQuietPublicTick === this.lastTick - 1
          ? (m.quiet ?? 0) + 1
          : 1;
      m.lastQuietTick = this.tickSerial;
      m.lastQuietPublicTick = this.lastTick;
      if (m.quiet < 2) return;
      m.busy = true;
      m.work = (async () => {
        try {
          const token = this.token();
          const checkpoint = {
            description: m.saved.goal?.description ?? "Maintenance",
            nextStep: JSON.stringify({
              stage: "CHECKPOINTED",
              version: this.policy.id,
              nextVersion: m.version,
              token,
              goal: m.saved.goal,
              position: this.state.player,
              inventory: this.state.inventory,
              equipment: this.state.equipment,
              skills: this.state.skills,
              dialog: this.state.dialog,
              interface: this.state.interface,
              routine: m.saved.routine
                ? { index: m.saved.routine.index, cycle: m.saved.routine.cycle }
                : null,
            }).slice(0, 2000),
          };
          await this.memory.checkpoint(checkpoint);
          // Full checkpoint is private and atomic; unlike the brief v1 goal, never truncate it.
          await this.memory.writeJson(
            this.memory.directory + "/maintenance.json",
            {
              schemaVersion: 2,
              token,
              version: this.policy.id,
              nextVersion: m.version,
              saved: m.saved,
              observed: copy(this.state),
              recordedAt: new Date().toISOString(),
            },
          );
          if (
            this.maintenance !== m ||
            !this.same(token) ||
            !this.churchSafe() ||
            m.stage !== "QUIESCING" ||
            performance.now() > m.deadline
          )
            throw new Error("CHECKPOINT_INVALIDATED");
          m.stage = "CHECKPOINTED";
          this.event("checkpointed");
          m.stage = "UPDATING";
          const next = this.policies.get(m.version);
          if (!next || !this.staged.has(m.version))
            throw new Error("UNSTAGED_VERSION");
          // Swap actual trusted policy behavior under the stable executor/SDK owner.
          this.policy = next;
          m.activated = true;
          this.controller++;
          m.received = this.adapter.receivedAt();
          m.stage = "REVALIDATING";
          this.event("version_activated", {
            version: next.id,
            cooldown: next.minCooldownTicks,
          });
        } catch {
          if (
            !this.stopRequested &&
            this.maintenance === m &&
            !["CANCELLED", "POSTPONED"].includes(m.stage)
          )
            this.rollbackMaintenance("ACTIVATION_FAILED");
        } finally {
          m.busy = false;
        }
      })();
      return;
    }
    if (m.stage === "REVALIDATING") {
      if (this.adapter.receivedAt() <= m.received) return;
      if (!this.churchSafe()) {
        this.rollbackMaintenance("REVALIDATION_FAILED");
        return;
      }
      m.stage = "RESUMING";
      this.goal = m.saved.goal;
      if(m.saved.continuation?.expiresAt>Date.now()&&!continuationUnsafe(m.saved.continuation,this.state))this.continuation={...copy(m.saved.continuation),token:this.token()};
      // Resume only remaining work under a new token; never replay an in-flight command.
      const routines = [m.saved.routine, ...m.saved.queue].filter(Boolean);
      const remaining = [];
      for (const r of routines) {
        if (r.continuation) continue; // Only a still-valid restored grant may regenerate resource work.
        if (r.inFlight) continue;
        if (r.results?.length && r.results.at(-1).status !== "verified")
          continue;
        const make = (steps, repeat) => ({
          ...r,
          id: randomUUID(),
          steps,
          index: 0,
          cycle: 0,
          repeat,
          results: [],
          token: this.token(),
          expiresAt: Date.now() + 60000,
        });
        const cycles = Math.max(0, r.repeat - r.cycle);
        if (!cycles) continue;
        remaining.push(make(r.steps.slice(r.index), 1));
        if (cycles > 1) remaining.push(make(r.steps, cycles - 1));
      }
      if (remaining.length > 5) {
        this.postpone("RESUME_QUEUE_REQUIRES_REPLAN");
        return;
      }
      this.routine = remaining.shift() ?? null;
      this.queue = remaining;
      this.metrics.add("maintenanceMs", performance.now() - m.started);
      this.metrics.count("maintenanceCompleted");
      this.event("maintenance_resumed", { version: this.policy.id });
      this.maintenance = null;
      this.phase = "PLAYING";
      this.schedule();
    }
  }
  rollbackMaintenance(reason) {
    const m = this.maintenance;
    if (!m) return;
    m.activated = false;
    this.policy = this.policies.get(m.previous);
    this.controller++;
    this.invalidate("MAINTENANCE_ROLLBACK");
    m.stage = "POSTPONED";
    m.reason = reason;
    this.phase = "PAUSED";
    this.blockReason = reason;
    this.metrics.count("rollbacks");
    this.event("rollback", { version: this.policy.id, reason });
  }
}
