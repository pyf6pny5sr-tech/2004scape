import { validateContinuation, nextContinuation, ordinaryResourceFailure, continuationLive } from "./continuity.mjs";
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
    this.lastTick = null;
    this.lastRevision = null;
    this.tickSerial = 0;
    this.cooldownUntil = 0;
    this.eligibleAt = 0;
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
      if (this.phase !== "STOPPED" && (!this.adapter.connected()||!this.adapter.controlled()||!this.adapter.bound(this.identity)||!Number.isFinite(this.adapter.age())||this.adapter.age()>this.config.maxAgeMs)) {
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
    this.pendingResourceResume = null;
    this.continuation = null;
    this.gatherLease = null;
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
    if (!["PLAYING", "PAUSED"].includes(this.phase))
      throw new Error("NOT_PLAYING");
    this.invalidate("TASK_CHANGED", { task: true });
    this.goal = copy(goal);
    this.phase = "PLAYING";
    this.event("goal");
    return this.token();
  }
  prepareProposal(proposal) {
    if (this.phase !== "PLAYING")
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
    if ((this.proposalIds.get(key)??0)>=Date.now()) throw new Error("DUPLICATE_PROPOSAL");
    const steps = proposal.steps.map(validateCommand);
    if(proposal.recordIds!==undefined&&!Array.isArray(proposal.recordIds))throw Error("INVALID_RECORD_IDS");
    const repeat = bounded(proposal.repeat ?? 1, 1, 20, "REPEAT");
    const continuation = proposal.continuation ? validateContinuation(proposal.continuation, this.state, this.token()) : !Object.hasOwn(proposal,'continuation')&&this.continuation?.mode==='standing'?this.continuation:null;
    if(continuation && steps.some(c=>!(['chop','burn_logs','walk'].includes(c.action))||(c.action==='chop'&&c.target.name!==continuation.target.name)||(c.action==='burn_logs'&&c.item.name!==continuation.log.name)))throw Error('CONTINUATION_INCOMPATIBLE_STEP');
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
    const unexpired=[...this.proposalIds.values()].filter(expiry=>expiry>=Date.now()).length;
    if(unexpired>=1000)throw Error('DEDUPLICATION_CAPACITY');
    return {routine,continuation,key,expiresAt:proposal.expiresAt,continuationApproved:!!proposal.continuation};
  }
  commitProposal({routine,continuation,key,expiresAt,continuationApproved}) {
    for (const [id, expiry] of this.proposalIds)
      if (expiry < Date.now()) this.proposalIds.delete(id);
    this.proposalIds.set(key, expiresAt);
    this.continuation = continuation;
    if (continuation&&continuationApproved) this.metrics.count("continuationApprovals");
    this.blockReason = null;
    this.queue.push(routine);
    this.event("plan_accepted", { id: routine.id });
    this.schedule();
    return { id: routine.id };
  }
  submit(proposal) { return this.commitProposal(this.prepareProposal(proposal)); }
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
    if (!this.same(p.token)) throw new Error("STALE_PLANNER_REQUEST");
    let prepared;
    try {
      if(proposal!==null) {
        if(!proposal||typeof proposal!=='object')throw Error('EXPLICIT_PROPOSAL_OR_NULL_REQUIRED');
        if(proposal.token!==undefined&&!this.same(proposal.token))throw Error('STALE_PLAN');
        prepared=this.prepareProposal({...proposal,token:p.token});
      }
    } catch(e) {
      const reason=/^[A-Z0-9_]+$/.test(e.message)?e.message:'INVALID_PROPOSAL';
      this.metrics.count('plannerProposalsRejected');this.event('planner_rejected',{id,reason});
      throw Error(reason);
    }
    // Validation and commit are synchronous: queue/goal/request cannot interleave here.
    this.planning.delete(id);this.requests=this.requests.filter(r=>r.id!==id);
    const turnaroundMs=performance.now()-p.started;
    this.metrics.add('plannerRequestMs',turnaroundMs);this.metrics.add('plannerTurnaroundMs',turnaroundMs);
    this.event('planner_response',{id,source,turnaroundMs,isolatedInferenceTime:false,declined:proposal===null});
    const result=prepared?this.commitProposal(prepared):{accepted:false,declined:true};
    this.metrics.count(prepared?'plannerPlansAccepted':'plannerDeclines');
    if(prepared&&source==='current_agent_tools')this.metrics.count('currentAgentToolPlansAccepted');
    return result;
  }
  async planWith(provider, context) {
    const r = this.requestPlan(context);
    try {
      const proposal = await provider(r);
      return this.completePlan(r.id, proposal, "optional_provider");
    } catch (e) {
      // Provider/validation failure does not revoke a correctable pending request or approved work.
      this.metrics.count("plannerFailures");
      throw e;
    }
  }
  observe(input) {
    if (this.phase === "STOPPED") return;
    const manualHold = this.phase === "PAUSED" && this.blockReason === "MANUAL_CANCEL";
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
      const retained=this.continuation;
      this.invalidate("PUBLICATION_CLOCK_RESET", { session: true });
      this.pendingResourceResume=retained;
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
      const retained=this.continuation??this.pendingResourceResume;
      this.invalidate("LIFE_CHANGED", { session: true });
      this.pendingResourceResume=retained;
      this.cooldownUntil = 0;
      if (!manualHold) {
        if(this.phase!=="BLOCKED")this.phase="PLAYING";
        this.blockReason="WAITING_FOR_LIVE_STATE";
      }
    }
    this.life = s.player?.lifeId ?? 0;
    if (!this.adapter.bound(this.identity)) {
      this.block("WORLD_OR_CHARACTER_CHANGED");
      return;
    }
    if (!this.fresh()) {
      this.cancelActive("UNSAFE_STATE");
      return;
    }
    this.lastFreshAt = now;
    if(this.pendingResourceResume&&this.phase!=="BLOCKED"){const g=this.pendingResourceResume;this.pendingResourceResume=null;if(continuationLive(g))this.continuation={...g,token:this.token()};}
    if(this.phase==="PAUSED"&&this.blockReason==="STALE_OR_DISCONNECTED"){this.phase="PLAYING";this.blockReason=null;}
    if(this.active?.continuation&&Date.now()>=this.active.expiresAt)this.cancelActive('CONTINUATION_ACTION_EXPIRED');
    if(this.continuation&&this.continuation.mode!=='standing'&&this.continuation.expiresAt<=Date.now()){this.continuation=null;this.metrics.count('continuationExpirations');}
    if(['BLOCKED','PAUSED'].includes(this.phase))return;
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
  effectsMatch(c,b,s) {
    return c.expect.every(e=>expected(e,b,s))&&(!c.resourceFireMove||(s.player.level===b.player.level&&(s.player.worldX!==b.player.worldX||s.player.worldZ!==b.player.worldZ)&&!(s.nearbyLocs??[]).some(l=>l.level===s.player.level&&l.x===s.player.worldX&&l.z===s.player.worldZ)&&!(c.avoidTiles??[]).some(t=>t.x===s.player.worldX&&t.z===s.player.worldZ)));
  }
  gatherMatches(c) {
    const g = this.gatherLease;
    return (
      !!g &&
      this.same(g.token) &&
      g.action === c.action &&
      (c.target.name !== undefined || c.target.id === undefined || c.target.id === g.target.id) &&
      (!c.target.exact || (c.target.x===g.target.x&&c.target.z===g.target.z)) &&
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
      !c.resourceFireMove && c.expect.every(
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
      this.metrics.count("continuedOwnedEffectSteps");
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
      } else {
        this.gatherLease.idleSince??=this.tickSerial;
        if(this.tickSerial-this.gatherLease.idleSince<2)return 'GATHER_SETTLING';
        this.gatherLease=null;
      }
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
    if(this.phase==='PLAYING'&&!this.planning.size&&this.requests.length<2)
      this.requestPlan({reason:'approved_runway_refill',continuation:this.continuationStatus()});
  }
  continuationStatus() {
    const g=this.continuation;
    return g?{recipe:g.recipe,mode:g.mode,chunk:g.chunk,remainingActions:g.remaining,expiresAt:g.expiresAt,runwayMs:g.mode==='standing'?null:Math.max(0,g.expiresAt-Date.now()),failures:g.failures,backoffTicks:Math.max(0,(g.retryAt??0)-this.tickSerial)}:null;
  }
  refillContinuation() {
    const g=this.continuation;
    if(!g||!this.same(g.token)||!continuationLive(g)){this.continuation=null;return;}
    if(g.mode==='standing'&&g.remaining<=0){g.remaining=g.maxActions;g.chunk++;this.metrics.count('standingChunksStarted');this.event('standing_chunk',{chunk:g.chunk,maxActions:g.maxActions});}
    g.blockedTargets=g.blockedTargets.filter(b=>b.until>this.tickSerial).slice(-64);g.blockedTiles=g.blockedTiles.filter(b=>b.until>this.tickSerial).slice(-64);
    if(!this.planning.size)this.ensureRefillRequest();
    if(this.tickSerial<(g.retryAt??0))return;
    const choice=nextContinuation(g,this.state,this.tickSerial);
    if(choice.reason){g.retryAt=this.tickSerial+Math.min(8,2**Math.min(3,(g.waitRounds??0)+1));g.waitRounds=(g.waitRounds??0)+1;this.blockReason=choice.reason;this.metrics.count('resourceWaitRounds');this.event('resource_wait',{reason:choice.reason,backoffTicks:g.retryAt-this.tickSerial});return;}
    g.waitRounds=0;
    const command=validateCommand(choice.command);g.remaining--;
    this.routine={id:randomUUID(),token:this.token(),expiresAt:g.mode==='standing'?Date.now()+command.timeoutMs+2000:g.expiresAt,steps:[command],repeat:1,index:0,cycle:0,results:[],recordIds:[],continuation:true,continuationId:g.id};
    this.metrics.count('continuationActionsGenerated');
  }
  launch(c, r, kind) {
    const grantAtLaunch = r?.continuation ? this.continuation : null;
    let before = copy(this.state), received = this.adapter.receivedAt();
    const token = this.token(),
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
            this.phase !== "BLOCKED",
        );
        if(result?.observationBaseline){before=copy(result.observationBaseline);received=result.baselineReceivedAt;}
        if(result?.resolvedTarget)active.resolvedTarget=result.resolvedTarget;
        if (abort.signal.aborted || !this.same(token) || (r&&r.expiresAt<=Date.now()))
          throw new Error("OLD_GENERATION");
        if (result?.success === false && ['chop','mine','burn_logs','walk'].includes(c.action)) {
          this.metrics.count('helperReportedFailures');
          ordinaryRecoverable=ordinaryResourceFailure(result.reason,result.message);
          const cause=['resource_unavailable','resource_depleted','resource_timeout','fire_blocked','path_incomplete'].includes(result.reason)?result.reason.toUpperCase():ordinaryRecoverable?'RESOURCE_HELPER_DELAY':'SDK_ACTION_FAILED';
          if(ordinaryRecoverable){
            try {await this.adapter.verify(s=>this.fresh()&&this.same(token)&&s.player?.lifeId===before.player.lifeId&&(!r||r.expiresAt>Date.now())&&this.adapter.receivedAt()>received&&this.effectsMatch(c,before,s),1200,abort.signal);this.metrics.count('helperFailuresReconciledByFreshEffect');this.event('effect_reconciled',{action:c.action,cause});}
            catch(error){if(error?.message!=='waitForCondition timed out')throw error;this.event('resource_failure',{action:c.action,cause});throw Error(cause);}
          }else throw Error(cause);
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
            (!r || r.expiresAt>Date.now()) &&
            this.adapter.receivedAt() > received &&
            this.effectsMatch(c,before,s),
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
        this.metrics.count("helperVerifiedCompletions");
      } catch (e) {
        reason = abort.signal.aborted ? "CANCELLED" : String(e.message);
        if(reason==="waitForCondition timed out"&&["chop","burn_logs","mine","walk"].includes(c.action))reason="RESOURCE_EFFECT_TIMEOUT";
        if(r&&r.expiresAt<=Date.now())reason="ACTION_APPROVAL_EXPIRED";
        ordinaryRecoverable ||= ordinaryResourceFailure(reason);
        const observed=this.adapter.state();
        if(ordinaryRecoverable&&!abort.signal.aborted&&this.same(token)&&(!r||r.expiresAt>Date.now())&&this.fresh()&&['chop','mine','burn_logs','walk'].includes(c.action)&&this.adapter.receivedAt()>received&&observed.player?.lifeId===before.player.lifeId&&this.effectsMatch(c,before,observed)) {
          after=copy(observed);status='verified';reason=null;
          this.cooldownUntil=Math.max(this.cooldownUntil,this.tickSerial+Math.max(c.cooldownTicks??1,this.policy.minCooldownTicks));
          this.metrics.count('verifiedActions');this.metrics.count('helperVerifiedCompletions');this.metrics.count('helperFailuresReconciledByFreshEffect');this.metrics.add('actionToEffectMs',performance.now()-started);
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
              const target = active.resolvedTarget ?? (before.nearbyLocs ?? [])
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

      }
      this.schedule();
    })();
  }
  finishFailure(r, reason, ordinaryRecoverable = false) {
    this.routine=null;this.blockReason=reason;
    const g=this.continuation,c=r?.steps[r.index];
    this.event('routine_failed',{reason});if(r)this.recordRoutine(r).catch(()=>{});
    if(ordinaryRecoverable&&g&&this.same(g.token)&&continuationLive(g)){
      if(r.continuation&&r.continuationId!==g.id){this.event('retired_continuation_yielded');return;}
      g.failures++;g.consecutiveFailures++;
      g.retryAt=this.tickSerial+Math.min(8,2**Math.min(3,g.consecutiveFailures));
      if(c?.action==='burn_logs'&&(reason==='FIRE_BLOCKED'||['RESOURCE_TIMEOUT','RESOURCE_EFFECT_TIMEOUT'].includes(reason))){g.relocate=true;g.blockedTiles.push({x:this.state.player.worldX,z:this.state.player.worldZ,until:this.tickSerial+80});}
      if(c?.action==='chop'&&c.target.x!==undefined)g.blockedTargets.push({x:c.target.x,z:c.target.z,until:this.tickSerial+8});
      if(c?.action==='walk')g.blockedTiles.push({x:c.x,z:c.z,until:this.tickSerial+80});
      this.gatherLease=null;this.metrics.count('boundedContinuationRecoveries');
      this.event('continuation_recovery',{action:c?.action,reason,backoffTicks:g.retryAt-this.tickSerial});this.ensureRefillRequest();
      // A bounded attempt failed; independent approved queued work is retained.
    }else if(!ordinaryRecoverable&&!['PRECONDITION_FAILED','COMBAT_TARGET_ONLY_IS_NOT_SERVER_ACCEPTANCE'].includes(reason)){this.block(reason);}
    else this.ensureRefillRequest();
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
  cancel() {
    this.invalidate('MANUAL_CANCEL',{task:true});this.phase='PAUSED';this.blockReason='MANUAL_CANCEL';return this.status();
  }
  resume() {
    if(this.phase!=='PAUSED'||!this.fresh())throw Error('FRESH_OWNED_STATE_REQUIRED');
    this.invalidate('EXPLICIT_RESUME',{task:true});this.phase='PLAYING';this.blockReason=null;return this.token();
  }
}
