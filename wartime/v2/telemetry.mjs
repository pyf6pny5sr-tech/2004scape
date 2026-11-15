export class Telemetry {
  constructor() {
    this.samples = {};
    this.counts = {};
    this.started = performance.now();
  }
  add(name, value) {
    if (!Number.isFinite(value) || value < 0) return;
    const a = (this.samples[name] ??= []);
    a.push(value);
    if (a.length > 10000) a.shift();
  }
  count(name, n = 1) {
    this.counts[name] = (this.counts[name] ?? 0) + n;
  }
  report() {
    const distributions = {};
    for (const [k, v] of Object.entries(this.samples)) {
      const a = [...v].sort((a, b) => a - b);
      const q = (p) => a[Math.min(a.length - 1, Math.ceil(p * a.length) - 1)];
      distributions[k] = {
        n: a.length,
        p50: q(0.5),
        p95: q(0.95),
        p99: q(0.99),
        min: a[0],
        max: a.at(-1),
      };
    }
    return {
      windowMs: performance.now() - this.started,
      counts: { ...this.counts },
      distributions,
      limits:
        "Observed client publication timing, not synchronized server phase. Dispatch is helper entry; effect is fresh observed postcondition. Cooldown/ongoing-action ticks are classified separately. Samples bounded to latest 10000 per metric.",
    };
  }
}
