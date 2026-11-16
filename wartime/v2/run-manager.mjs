import { RunStore, RunError, runConfig, runId, fail } from "./run-store.mjs";
const ambiguous = new Set([
  "CLIENT_READINESS_TIMEOUT",
  "OWNER_READY_TIMEOUT",
  "OLD_LOGIN_AMBIGUOUS",
  "CLIENT_DISCONNECTED",
  "SDK_RECONNECT_AMBIGUOUS",
  "ATTACHED_CLIENT_UNVERIFIED",
]);
export class RunManager {
  constructor(config, options, deps) {
    this.config = runConfig(config);
    this.options = options;
    this.deps = deps;
    this.store = new RunStore(this.config, options.runId ?? runId());
    this.client = null;
    this.owner = null;
    this.stopped = false;
    this.cycle = 0;
    this.abort = new AbortController();
  }
  start() {
    if (!this.startPromise) this.startPromise = this.startImpl();
    return this.startPromise;
  }
  async startImpl() {
    const resume = this.options.mode === "resume";
    if (resume) await this.store.load();
    else await this.store.create();
    await this.store.acquire(resume);
    this.externalAbort = () => {
      this.abort.abort(new RunError("RUN_CANCELLED"));
      if (this.established) void this.close("CANCELLED");
    };
    this.options.signal?.addEventListener("abort", this.externalAbort, {
      once: true,
    });
    try {
      if (this.options.signal?.aborted) fail("RUN_CANCELLED");
      if (resume) await this.deps.recover?.(this.store, this.abort.signal);
      await this.establish(resume);
      this.established = true;
      return this;
    } catch (e) {
      await this.dispose();
      this.store.record.status =
        e.code === "RUN_CANCELLED" ? "CANCELLED" : "BLOCKED";
      this.store.record.lastError = e.code ?? "STARTUP_FAILED";
      await this.store.save();
      await this.store.release();
      this.options.signal?.removeEventListener("abort", this.externalAbort);
      throw e;
    }
  }
  async preflight() {
    if (this.abort.signal.aborted) fail("RUN_CANCELLED");
    await this.deps.probe(this.config, this.abort.signal);
  }
  async vacant(requireNoClient = true) {
    const s = await this.deps.status(
      this.config,
      this.store.account.character,
      this.abort.signal,
    );
    if (s.state === "UNKNOWN")
      fail((s.category ?? "NETWORK") + "_STATUS_UNKNOWN");
    if (s.state !== "ZERO") fail("OWNERSHIP_OCCUPIED");
    if (
      requireNoClient &&
      (s.inGame || (s.clientStatus && s.clientStatus !== "dead"))
    )
      fail("CLIENT_ALREADY_ATTACHED");
    return s;
  }
  async establish(resume) {
    let reconnect = resume;
    for (;;) {
      await this.preflight();
      const a = this.store.account;
      try {
        await this.vacant();
      } catch (e) {
        if (
          !reconnect &&
          ["OWNERSHIP_OCCUPIED", "CLIENT_ALREADY_ATTACHED"].includes(e.code) &&
          !a.evidence.loginAttempted &&
          this.store.record.collisionRetriesUsed < 2
        ) {
          this.store.record.collisionRetriesUsed++;
          this.store.appendIdentity("NAME_COLLISION_NO_LOGIN");
          await this.store.save();
          continue;
        }
        throw e;
      }
      if (
        reconnect &&
        a.reconnectAttemptsUsed >= this.store.record.reconnectLimit
      ) {
        await this.replace();
        reconnect = false;
        continue;
      }
      if (reconnect) {
        a.reconnectAttemptsUsed++;
        a.reconnectAttemptsTotal = (a.reconnectAttemptsTotal ?? 0) + 1;
        await this.store.save();
      }
      try {
        await this.attempt(reconnect);
        return;
      } catch (e) {
        if (e.evidence) Object.assign(a.evidence, e.evidence);
        await this.dispose();
        a.status = "ATTEMPT_FAILED";
        this.store.record.lastError = e.code ?? "STARTUP_FAILED";
        await this.store.save();
        if (this.abort.signal.aborted) fail("RUN_CANCELLED");
        if (!reconnect || !ambiguous.has(e.code)) throw e;
        // Recheck infrastructure and ownership before another attempt or any minting.
        await this.preflight();
        await this.vacant();
      }
    }
  }
  async replace() {
    await this.dispose();
    await this.preflight();
    await this.vacant();
    if (
      this.store.record.replacementsUsed >= this.store.record.replacementLimit
    )
      fail("REPLACEMENT_BUDGET_EXHAUSTED");
    this.store.record.replacementsUsed++;
    this.store.appendIdentity("REPLACED_AFTER_RECONNECT_BUDGET");
    this.store.record.status = "REPLACEMENT_PERSISTED";
    await this.store.save();
  }
  async attempt(reconnect) {
    const a = this.store.account;
    const sequence = ++this.cycle;
    const timeout = reconnect
      ? this.config.reconnectTimeoutMs
      : this.config.startupTimeoutMs;
    const attemptAbort = new AbortController();
    const abort = () => attemptAbort.abort(this.abort.signal.reason);
    this.abort.signal.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(
      () => attemptAbort.abort(new RunError("CLIENT_READINESS_TIMEOUT")),
      timeout,
    );
    a.evidence.loginAttempted = true;
    a.status = "CLIENT_STARTING";
    this.store.record.status = "CLIENT_STARTING";
    await this.store.save();
    try {
      this.client = await this.deps.launchClient(this.store, {
        signal: attemptAbort.signal,
        requireFresh: !a.evidence.freshStateConfirmed,
      });
      const ready = await this.client.ready;
      Object.assign(a.evidence, ready);
      a.status = "CLIENT_READY";
      this.store.record.status = "CLIENT_READY";
      await this.store.save();
      if (attemptAbort.signal.aborted) throw attemptAbort.signal.reason;
      const status = await this.vacant(false);
      if (!status.inGame) fail("ATTACHED_CLIENT_UNVERIFIED");
      this.owner = await this.deps.connectOwner(this.store, {
        signal: attemptAbort.signal,
        onStop: () => this.close(),
      });
      if (attemptAbort.signal.aborted) throw attemptAbort.signal.reason;
      Object.assign(a.evidence, this.owner.evidence);
      a.reconnectAttemptsUsed = 0;
      a.status = "CONTROLLER_READY";
      this.store.record.status = this.owner.evidence?.tutorialPending
        ? "CONTROLLER_READY_TUTORIAL_PENDING"
        : "CONTROLLER_READY";
      delete this.store.record.lastError;
      await this.store.save();
      if (attemptAbort.signal.aborted) throw attemptAbort.signal.reason;
      this.deps.onStatus?.(this.store.summary());
      this.watchLoss(sequence, this.client.lost);
      this.watchLoss(sequence, this.owner.lost);
    } finally {
      clearTimeout(timer);
      this.abort.signal.removeEventListener("abort", abort);
    }
  }
  watchLoss(sequence, promise) {
    if (!promise) return;
    promise
      .then((code) => {
        if (this.stopped || sequence !== this.cycle) return;
        this.recovery = (async () => {
          await this.dispose();
          this.store.record.status = "RECONNECTING";
          await this.store.save();
          try {
            if (
              [
                "OWNERSHIP_LOST",
                "AUTH_BLOCKED",
                "OUTDATED_CLIENT",
                "RATE_LIMIT",
                "NETWORK_POLICY",
                "NETWORK_TRANSPORT",
                "NETWORK_ACCESS_DENIED",
                "SERVER_UNAVAILABLE",
                "CLIENT_PROTOCOL_FAILED",
              ].includes(code)
            )
              fail(code);
            await this.establish(true);
          } catch (e) {
            await this.dispose();
            this.store.record.status = this.stopped
              ? (this.requestedCloseStatus ?? "CANCELLED")
              : "BLOCKED";
            this.store.record.lastError = e.code ?? "RECONNECT_FAILED";
            await this.store.save();
            if (!this.stopped) await this.store.release();
            this.stopped = true;
            this.deps.onStatus?.(this.store.summary());
          }
        })();
      })
      .catch(() => {});
  }
  async dispose() {
    this.cycle++;
    const owner = this.owner,
      client = this.client;
    this.owner = null;
    this.client = null;
    try {
      await owner?.close();
    } finally {
      await client?.close();
    }
  }
  async close(status = "STOPPED") {
    if (this.closing) return this.closing;
    this.stopped = true;
    this.requestedCloseStatus = status;
    this.abort.abort(new RunError("RUN_CANCELLED"));
    this.closing = (async () => {
      if (this.startPromise) await this.startPromise.catch(() => {});
      await this.dispose();
      if (this.recovery) await this.recovery;
      if (this.store.lock) {
        this.store.record.status = status;
        await this.store.save();
        await this.store.release();
        this.deps.onStatus?.(this.store.summary());
      }
      this.options.signal?.removeEventListener("abort", this.externalAbort);
    })();
    return this.closing;
  }
}
