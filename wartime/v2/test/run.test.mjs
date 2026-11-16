import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, stat, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { RunManager } from "../run-manager.mjs";
import { credentials, RunError, runConfig, RunStore } from "../run-store.mjs";
async function fixture(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "wartime-runs-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const config = {
    world: "http://localhost:8888",
    gateway: "ws://localhost:7780/",
    runtimeRoot: dir,
    reconnectTimeoutMs: 1000,
  };
  const state = {
    client: false,
    owner: false,
    launches: [],
    events: [],
    probes: 0,
  };
  const deps = {
    probe: async () => {
      state.probes++;
    },
    status: async () => ({
      state: state.owner ? "OCCUPIED" : "ZERO",
      inGame: state.client,
      clientStatus: state.client ? "active" : "dead",
    }),
    recover: async () => {},
    launchClient: async (store, { signal }) => {
      const saved = JSON.parse(await readFile(store.file, "utf8"));
      assert.equal(saved.accounts.at(-1).character, store.account.character);
      assert.equal(saved.accounts.at(-1).evidence.loginAttempted, true);
      state.launches.push(store.account.character);
      state.client = true;
      state.events.push("client-start");
      return {
        ready: Promise.resolve({
          clientLoggedIn: true,
          freshStateConfirmed: true,
          clientAttached: true,
        }),
        close: async () => {
          state.client = false;
          state.events.push("client-stop");
        },
      };
    },
    connectOwner: async () => {
      assert.equal(state.owner, false);
      state.owner = true;
      state.events.push("owner-start");
      return {
        evidence: { controllerReady: true, onboardingComplete: true },
        close: async () => {
          state.owner = false;
          state.events.push("owner-stop");
        },
      };
    },
  };
  const start = (options = {}, overrides = {}) =>
    new RunManager(
      config,
      { mode: "new", ...options },
      { ...deps, ...overrides },
    ).start();
  return { dir, config, state, deps, start };
}

test("new run needs no name/password; CSPRNG identities satisfy SDK limits", async (t) => {
  const f = await fixture(t);
  const values = Array.from({ length: 100 }, credentials);
  assert.equal(new Set(values.map((v) => v.character)).size, 100);
  for (const c of values) {
    assert.match(c.character, /^[a-z0-9]{12}$/);
    assert.match(c.password, /^[A-Za-z0-9]{20}$/);
  }
  const m = await f.start();
  assert.equal(m.store.record.status, "CONTROLLER_READY");
  assert.equal(m.store.record.accounts.length, 1);
  await m.close();
});
test("independent top-level runs get different private identities; same-run resume keeps identity", async (t) => {
  const f = await fixture(t);
  const a = await f.start();
  const first = { ...a.store.account };
  const id = a.store.id;
  await a.close();
  const b = await f.start({ mode: "resume", runId: id });
  assert.equal(b.store.account.character, first.character);
  assert.equal(b.store.account.password, first.password);
  await b.close();
  const c = await f.start();
  assert.notEqual(c.store.id, id);
  assert.notEqual(c.store.account.character, first.character);
  await c.close();
});
test("credentials are private and sanitized output omits password and private progress", async (t) => {
  const f = await fixture(t);
  const m = await f.start();
  assert.equal((await stat(m.store.file)).mode & 0o777, 0o600);
  assert.equal((await stat(m.store.dir)).mode & 0o777, 0o700);
  assert.ok(
    !JSON.stringify(m.store.summary()).includes(m.store.account.password),
  );
  assert.equal(m.store.summary().character, m.store.account.character);
  await m.close();
});
test("repeated/concurrent startup of one run cannot launch a second client or owner", async (t) => {
  const f = await fixture(t);
  const m = await f.start();
  await assert.rejects(
    f.start({ mode: "resume", runId: m.store.id }),
    /RUN_ALREADY_ACTIVE/,
  );
  assert.equal(f.state.launches.length, 1);
  await m.close();
  const attempts = await Promise.allSettled([
    f.start({ mode: "resume", runId: m.store.id }),
    f.start({ mode: "resume", runId: m.store.id }),
  ]);
  assert.equal(attempts.filter((x) => x.status === "fulfilled").length, 1);
  await attempts.find((x) => x.status === "fulfilled").value.close();
});
test("positively observed name collisions have a bounded pre-login retry budget", async (t) => {
  const f = await fixture(t);
  let n = 0;
  const m = await f.start(
    {},
    {
      status: async () =>
        ++n <= 2
          ? { state: "OCCUPIED", inGame: true, clientStatus: "active" }
          : f.deps.status(),
    },
  );
  assert.equal(m.store.record.collisionRetriesUsed, 2);
  assert.equal(m.store.record.accounts.length, 3);
  assert.equal(f.state.launches.length, 1);
  assert.equal(m.store.record.replacementsUsed, 0);
  await m.close();
});
test("unknown status and infrastructure errors never mint replacements or start clients", async (t) => {
  for (const code of [
    "NETWORK_POLICY",
    "NETWORK_TRANSPORT",
    "OUTDATED_CLIENT",
    "RATE_LIMIT",
    "SERVER_UNAVAILABLE",
  ]) {
    const f = await fixture(t);
    const m = await f.start();
    await m.close();
    const record = JSON.parse(await readFile(m.store.file, "utf8"));
    await assert.rejects(
      f.start(
        { mode: "resume", runId: m.store.id },
        {
          probe: async () => {
            throw new RunError(code);
          },
        },
      ),
      new RegExp(code),
    );
    const after = JSON.parse(await readFile(m.store.file, "utf8"));
    assert.equal(after.accounts.length, record.accounts.length);
    assert.equal(after.replacementsUsed, 0);
    assert.equal(f.state.launches.length, 1);
  }
  const f = await fixture(t);
  await assert.rejects(
    f.start(
      {},
      { status: async () => ({ state: "UNKNOWN", category: "NETWORK" }) },
    ),
    /NETWORK_STATUS_UNKNOWN/,
  );
  assert.equal(f.state.launches.length, 0);
});
test("old-character timeout drains old resources before exactly one fresh replacement", async (t) => {
  const f = await fixture(t);
  const original = await f.start();
  const old = { ...original.store.account };
  original.store.account.progress = { marker: "preserve" };
  await original.store.save();
  await original.close();
  let failed = 0;
  const m = await f.start(
    { mode: "resume", runId: original.store.id },
    {
      launchClient: async (store, options) => {
        if (store.account.character === old.character) {
          failed++;
          f.state.client = true;
          f.state.events.push("old-client");
          return {
            ready: Promise.reject(new RunError("CLIENT_READINESS_TIMEOUT")),
            close: async () => {
              f.state.client = false;
              f.state.events.push("old-client-stop");
            },
          };
        }
        assert.equal(f.state.owner, false);
        assert.equal(f.state.client, false);
        return f.deps.launchClient(store, options);
      },
    },
  );
  assert.equal(failed, 2);
  assert.equal(m.store.record.replacementsUsed, 1);
  assert.notEqual(m.store.account.character, old.character);
  assert.equal(m.store.record.accounts[0].password, old.password);
  assert.deepEqual(m.store.record.accounts[0].progress, { marker: "preserve" });
  assert.equal(m.store.record.accounts[0].reconnectAttemptsUsed, 2);
  await m.close();
});
test("replacement/reconnect budget survives same-run recovery and cannot reset", async (t) => {
  const f = await fixture(t);
  const initial = await f.start();
  await initial.close();
  const failOld = {
    launchClient: async () => ({
      ready: Promise.reject(new RunError("OLD_LOGIN_AMBIGUOUS")),
      close: async () => {},
    }),
  };
  await assert.rejects(
    f.start({ mode: "resume", runId: initial.store.id }, failOld),
    /OLD_LOGIN_AMBIGUOUS/,
  );
  const first = JSON.parse(await readFile(initial.store.file, "utf8"));
  assert.equal(first.replacementsUsed, 1);
  assert.equal(first.accounts.length, 2);
  await assert.rejects(
    f.start({ mode: "resume", runId: initial.store.id }, failOld),
    /REPLACEMENT_BUDGET_EXHAUSTED/,
  );
  const second = JSON.parse(await readFile(initial.store.file, "utf8"));
  assert.equal(second.accounts.length, 2);
  assert.equal(second.accounts[1].reconnectAttemptsUsed, 2);
});
test("fresh startup login ambiguity is not an automatic account retry storm", async (t) => {
  const f = await fixture(t);
  let calls = 0;
  const m = new RunManager(
    f.config,
    { mode: "new" },
    {
      ...f.deps,
      launchClient: async () => {
        calls++;
        return {
          ready: Promise.reject(new RunError("OLD_LOGIN_AMBIGUOUS")),
          close: async () => {},
        };
      },
    },
  );
  await assert.rejects(m.start(), /OLD_LOGIN_AMBIGUOUS/);
  assert.equal(calls, 1);
  assert.equal(m.store.record.accounts.length, 1);
  assert.equal(m.store.record.replacementsUsed, 0);
});
test("ownership remains fail-closed on old-run resume, never kicks another controller", async (t) => {
  const f = await fixture(t);
  const m = await f.start();
  await m.close();
  await assert.rejects(
    f.start(
      { mode: "resume", runId: m.store.id },
      { status: async () => ({ state: "OCCUPIED", inGame: true }) },
    ),
    /OWNERSHIP_OCCUPIED/,
  );
  assert.equal(f.state.launches.length, 1);
});
test("client readiness cancellation closes only owned child and does not connect owner", async (t) => {
  const f = await fixture(t);
  const outside = path.join(f.dir, "unrelated");
  await writeFile(outside, "keep");
  let closed = 0;
  const abort = new AbortController();
  const manager = new RunManager(
    f.config,
    { mode: "new", signal: abort.signal },
    {
      ...f.deps,
      launchClient: async (store, { signal }) => ({
        ready: new Promise((r, j) =>
          signal.addEventListener("abort", () =>
            j(new RunError("RUN_CANCELLED")),
          ),
        ),
        close: async () => {
          closed++;
        },
      }),
    },
  );
  const started = manager.start();
  while (!manager.client) await new Promise((r) => setTimeout(r, 1));
  abort.abort();
  await assert.rejects(started, /RUN_CANCELLED/);
  assert.equal(closed, 1);
  assert.equal(f.state.owner, false);
  assert.equal(await readFile(outside, "utf8"), "keep");
});
test("world changes, invalid configuration and reused run IDs cannot overwrite records", async (t) => {
  const f = await fixture(t);
  assert.throws(
    () => runConfig({ ...f.config, character: "remembered" }),
    /OMIT_CHARACTER/,
  );
  assert.throws(
    () => runConfig({ ...f.config, maxAutomaticReplacements: 2 }),
    /ACCOUNT_REPLACEMENTS/,
  );
  const m = await f.start();
  await m.close();
  const before = await readFile(m.store.file, "utf8");
  await assert.rejects(f.start({ runId: m.store.id }), /EEXIST/);
  await assert.rejects(
    new RunManager(
      { ...f.config, world: "http://localhost:9999" },
      { mode: "resume", runId: m.store.id },
      f.deps,
    ).start(),
    /WORLD_IDENTITY_CHANGED/,
  );
  assert.equal(await readFile(m.store.file, "utf8"), before);
});

test("successful ordinary resumes do not exhaust the failed-reconnect budget or mint accounts", async (t) => {
  const f = await fixture(t);
  let m = await f.start();
  const id = m.store.id,
    name = m.store.account.character;
  await m.close();
  for (let n = 0; n < 4; n++) {
    m = await f.start({ mode: "resume", runId: id });
    assert.equal(m.store.account.character, name);
    assert.equal(m.store.account.reconnectAttemptsUsed, 0);
    assert.equal(m.store.record.replacementsUsed, 0);
    await m.close();
  }
  assert.equal(m.store.account.reconnectAttemptsTotal, 4);
});
test("close during startup waits for owned client cleanup before releasing the lease", async (t) => {
  const f = await fixture(t);
  let released;
  const manager = new RunManager(
    f.config,
    { mode: "new" },
    {
      ...f.deps,
      launchClient: async (store, { signal }) => ({
        ready: new Promise((r, j) =>
          signal.addEventListener("abort", () =>
            j(new RunError("RUN_CANCELLED")),
          ),
        ),
        close: async () => {
          assert.ok(manager.store.lock);
          await new Promise((r) => setTimeout(r, 5));
          released = true;
        },
      }),
    },
  );
  const starting = manager.start();
  starting.catch(() => {});
  while (!manager.client) await new Promise((r) => setTimeout(r, 1));
  await manager.close();
  await assert.rejects(starting, /RUN_CANCELLED/);
  assert.equal(released, true);
  assert.equal(manager.store.lock, null);
});

test("an unavailable client is terminal on resume and never causes replacement", async (t) => {
  const f = await fixture(t);
  const initial = await f.start();
  await initial.close();
  await assert.rejects(
    f.start(
      { mode: "resume", runId: initial.store.id },
      {
        launchClient: async () => {
          throw new RunError("CLIENT_UNAVAILABLE");
        },
      },
    ),
    /CLIENT_UNAVAILABLE/,
  );
  const record = JSON.parse(await readFile(initial.store.file, "utf8"));
  assert.equal(record.accounts.length, 1);
  assert.equal(record.replacementsUsed, 0);
});
test("stale owner recovery is explicit and preserves run budgets", async (t) => {
  const f = await fixture(t);
  const initial = await f.start();
  await initial.close();
  const store = new RunStore(runConfig(f.config), initial.store.id);
  await store.load();
  const lock = path.join(store.dir, "owner.lock");
  const { mkdir } = await import("node:fs/promises");
  await mkdir(lock, { mode: 0o700 });
  await writeFile(
    path.join(lock, "owner.json"),
    JSON.stringify({ pid: 2147483647, start: "dead", token: "prior-owner" }),
    { mode: 0o600 },
  );
  await store.acquire(true);
  assert.equal(store.previousOwner.token, "prior-owner");
  assert.equal(store.record.replacementsUsed, 0);
  await store.release();
});

test("corrupt persisted recovery budgets fail closed before creating identities", async (t) => {
  const f = await fixture(t);
  const initial = await f.start();
  await initial.close();
  const record = JSON.parse(await readFile(initial.store.file, "utf8"));
  record.replacementLimit = 100;
  delete record.replacementsUsed;
  await writeFile(initial.store.file, JSON.stringify(record), { mode: 0o600 });
  await assert.rejects(
    f.start({ mode: "resume", runId: initial.store.id }),
    /RUN_RECORD_INVALID/,
  );
  assert.equal(f.state.launches.length, 1);
});

test("resume reloads the generation and spent budget saved between initial read and lease acquisition", async (t) => {
  const f = await fixture(t);
  const initial = await f.start();
  await initial.close();
  const attempted = [];
  const manager = new RunManager(
    f.config,
    { mode: "resume", runId: initial.store.id },
    {
      ...f.deps,
      launchClient: async (store) => {
        attempted.push(store.account.character);
        return {
          ready: Promise.reject(new RunError("OLD_LOGIN_AMBIGUOUS")),
          close: async () => {},
        };
      },
    },
  );
  const acquire = manager.store.acquire.bind(manager.store);
  let newerName, newerPassword;
  manager.store.acquire = async (resume) => {
    assert.equal(manager.store.record.activeGeneration, 0);
    assert.equal(manager.store.record.replacementsUsed, 0);
    // A different cooperating owner wins the lease after our initial read.
    const other = new RunStore(runConfig(f.config), initial.store.id);
    await other.load();
    await other.acquire(true);
    try {
      other.account.reconnectAttemptsUsed = 2;
      other.record.replacementsUsed = 1;
      other.appendIdentity("REPLACED_AFTER_RECONNECT_BUDGET");
      other.account.reconnectAttemptsUsed = 1;
      other.account.evidence.loginAttempted = true;
      other.account.evidence.freshStateConfirmed = true;
      newerName = other.account.character;
      newerPassword = other.account.password;
      await other.save();
    } finally {
      await other.release();
    }
    await acquire(resume);
  };
  await assert.rejects(manager.start(), /REPLACEMENT_BUDGET_EXHAUSTED/);
  const saved = JSON.parse(await readFile(initial.store.file, "utf8"));
  assert.deepEqual(attempted, [newerName]);
  assert.equal(saved.activeGeneration, 1);
  assert.equal(saved.replacementsUsed, 1);
  assert.equal(saved.accounts.length, 2);
  assert.equal(saved.accounts[1].password, newerPassword);
  assert.equal(saved.accounts[1].reconnectAttemptsUsed, 2);
  assert.equal(saved.accounts[0].reconnectAttemptsUsed, 2);
});

for (const invalid of ["schema", "world", "syntax"])
  test(
    "post-lease " +
      invalid +
      " validation failure releases lease without overwriting the newer record",
    async (t) => {
      const f = await fixture(t);
      const initial = await f.start();
      await initial.close();
      let recoveries = 0;
      const manager = new RunManager(
        f.config,
        { mode: "resume", runId: initial.store.id },
        {
          ...f.deps,
          recover: async () => {
            recoveries++;
          },
        },
      );
      const acquire = manager.store.acquire.bind(manager.store);
      let bytes;
      manager.store.acquire = async (resume) => {
        const other = new RunStore(runConfig(f.config), initial.store.id);
        await other.load();
        await other.acquire(true);
        try {
          bytes =
            invalid === "syntax"
              ? "{invalid json"
              : invalid === "schema"
                ? JSON.stringify({
                    schemaVersion: 1,
                    note: "new invalid state",
                  })
                : JSON.stringify({
                    ...other.record,
                    world: "http://localhost:9999",
                  });
          await writeFile(other.file, bytes, { mode: 0o600 });
        } finally {
          await other.release();
        }
        await acquire(resume);
      };
      await assert.rejects(
        manager.start(),
        invalid === "schema"
          ? /RUN_RECORD_INVALID/
          : invalid === "world"
            ? /RUN_WORLD_IDENTITY_CHANGED/
            : SyntaxError,
      );
      assert.equal(await readFile(initial.store.file, "utf8"), bytes);
      assert.equal(manager.store.lock, null);
      assert.equal(manager.store.record, undefined);
      assert.equal(recoveries, 0);
      assert.equal(f.state.launches.length, 1);
      assert.equal(f.state.client, false);
      assert.equal(f.state.owner, false);
      await assert.rejects(
        stat(path.join(manager.store.dir, "owner.lock")),
        (e) => e.code === "ENOENT",
      );
    },
  );
