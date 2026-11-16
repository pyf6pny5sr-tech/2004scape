import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  rm,
  mkdir,
  writeFile,
  readFile,
  stat,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import {
  prepare,
  discover,
  ensure,
  onlineConfig,
  verifyRuntime,
  SDK_COMMIT,
} from "../bootstrap.mjs";
import { sourceIdentity, runtimeIdentity } from "../identity.mjs";
import {
  socketRoute,
  installManagedWebSocketProxy,
  transportSummary,
} from "../managed-websocket.mjs";
import { processStamp } from "../run-store.mjs";
async function temp(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "wartime-agent-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}
test("status on a missing home is read-only and does not prepare or provision", async (t) => {
  const home = path.join(await temp(t), "absent");
  assert.equal((await discover(home)).state, "NOT_PREPARED");
  await assert.rejects(stat(home), (e) => e.code === "ENOENT");
});
test("product bootstrap accepts only explicit online TLS worlds and no model credentials", () => {
  const c = onlineConfig();
  assert.equal(c.world, "https://rs-sdk.maxbittker.com");
  assert.equal(c.gateway, "wss://rs-sdk.maxbittker.com/gateway");
  assert.equal(c.character, undefined);
  assert.throws(
    () =>
      onlineConfig({
        world: "http://localhost:8888",
        gateway: "ws://localhost:7780",
      }),
    /ONLINE_TLS/,
  );
});
test("bootstrap is idempotent, installs only pinned client dependencies and needs no provider", async (t) => {
  const home = path.join(await temp(t), "runtime"),
    calls = [],
    source = await sourceIdentity();
  const deps = {
    findBun: () => "/available/bun",
    command: async (file, args, cwd, env) => {
      calls.push({ file, args, cwd });
      if (args[0] === "rev-parse") return { stdout: SDK_COMMIT + "\n" };
      if (file === "/available/bun")
        assert.equal(env.PUPPETEER_SKIP_DOWNLOAD, "1");
      return { stdout: "" };
    },
    installedIdentity: async () => ({
      ...source,
      sdkCommit: SDK_COMMIT,
      sdkModuleSha256: { fixture: "controlled" },
    }),
  };
  // Stub network/package operations, not an actual SDK install or gameplay claim.
  const a = await prepare(
    { home, world: "https://world.test", gateway: "wss://world.test/gateway", runOptions: { maxAutomaticReplacements: 0 } },
    deps,
  );
  assert.equal(a.state, "PREPARED");
  assert.equal(a.prepared.providerRequired, false);
  const count = calls.filter((x) => x.args.includes("install")).length;
  assert.equal(count, 2);
  assert.ok(calls.some((x) => x.args.includes(SDK_COMMIT)));
  assert.ok(calls.some((x) => x.args.includes("server/webclient")));
  assert.ok(!calls.some((x) => x.cwd.endsWith("/server/engine")));
  await prepare({ home }, deps);
  assert.equal(calls.filter((x) => x.args.includes("install")).length, count);
  const config = JSON.parse(
    await readFile(path.join(home, "run-config.json"), "utf8"),
  );
  assert.equal(config.character, undefined);
  assert.equal(config.password, undefined);
  assert.equal(config.handoff, undefined);
  assert.equal(config.maxAutomaticReplacements, 0);
});
async function activeFixture(t) {
  const home = await temp(t),
    implementation = await runtimeIdentity(),
    id = "r" + "a".repeat(32),
    socket = path.join(home, "runs", id, "host.sock");
  await mkdir(path.dirname(socket), { recursive: true });
  const prepared = {
    ...implementation,
    world: "https://world.test",
    gateway: "wss://world.test/gateway",
    sdkCommit: SDK_COMMIT,
  };
  await writeFile(path.join(home, "prepared.json"), JSON.stringify(prepared));
  await writeFile(
    path.join(home, "owner.json"),
    JSON.stringify({ kind: "wartime-online-agent" }),
  );
  await writeFile(
    path.join(home, "active.json"),
    JSON.stringify({
      runId: id,
      socket,
      pid: process.pid,
      start: await processStamp(process.pid),
    }),
  );
  const observed = {
    implementation,
    runId: id,
    world: prepared.world,
    gateway: prepared.gateway,
    character: "fixture",
    planner: { mode: "current_agent", providerRequired: false },
  };
  return { home, prepared, observed };
}
test("setup/ensure discover verified active runtime without copying source, provisioning or requiring Bun again", async (t) => {
  const f = await activeFixture(t);
  const before = await readFile(path.join(f.home, "prepared.json"), "utf8");
  const deps = {
    request: async () => f.observed,
    command: () => {
      throw Error("MUST_NOT_INSTALL");
    },
    findBun: () => {
      throw Error("MUST_NOT_REQUIRE_BUN");
    },
  };
  assert.equal((await prepare({ home: f.home }, deps)).state, "RUNNING");
  assert.equal((await ensure({ home: f.home }, deps)).state, "RUNNING");
  assert.equal(
    await readFile(path.join(f.home, "prepared.json"), "utf8"),
    before,
  );
  await assert.rejects(
    ensure({ home: f.home, newRun: true }, deps),
    /ACTIVE_RUN_MUST_BE_STOPPED/,
  );
});
test("a name/label without computed source identity is never accepted as our runtime", async (t) => {
  const f = await activeFixture(t);
  assert.throws(
    () =>
      verifyRuntime(
        {
          ...f.observed,
          implementation: {
            implementation: "wartime-v2",
            identityProtocol: 1,
            buildSha256: f.prepared.buildSha256,
          },
        },
        f.prepared,
        { runId: f.observed.runId },
      ),
    /UNVERIFIED_RUNTIME/,
  );
  const result = await ensure(
    { home: f.home },
    {
      request: async () => ({
        ...f.observed,
        implementation: { name: "Wartime" },
      }),
    },
  );
  assert.equal(result.state, "ACTIVE_UNVERIFIED_OR_STARTING");
});
test("unrelated preexisting workspace contents are never overwritten", async (t) => {
  const home = await temp(t);
  await writeFile(path.join(home, "unrelated.txt"), "keep");
  await assert.rejects(
    prepare({ home }, { findBun: () => "/available/bun" }),
    /RUNTIME_HOME_NOT_OWNED/,
  );
  assert.equal(
    await readFile(path.join(home, "unrelated.txt"), "utf8"),
    "keep",
  );
});
test("managed WebSocket uses only configured proxy, keeps binary protocols and rejects another route", () => {
  const seen = [];
  class Fake {
    constructor(url, options) {
      seen.push({ url, options });
    }
  }
  const env = {
    HTTPS_PROXY: "http://user:SECRET@approved.test:8080",
    NO_PROXY: ".internal.test",
  };
  const target = { Bun: {}, WebSocket: Fake };
  installManagedWebSocketProxy({ target, env });
  new target.WebSocket("wss://rs-sdk.maxbittker.com/gateway", "binary");
  assert.deepEqual(seen[0].options.protocols, ["binary"]);
  assert.equal(seen[0].options.proxy, env.HTTPS_PROXY);
  new target.WebSocket("wss://a.internal.test");
  assert.equal(seen[1].options.proxy, undefined);
  assert.throws(
    () =>
      new target.WebSocket("wss://rs-sdk.maxbittker.com/gateway", {
        proxy: "http://other.test",
      }),
    /OVERRIDE_NOT_ALLOWED/,
  );
  assert.equal(
    socketRoute("wss://host.test", { HTTPS_PROXY: env.HTTPS_PROXY }).mode,
    "environment_configured_proxy",
  );
  assert.ok(
    !JSON.stringify(
      transportSummary("wss://rs-sdk.maxbittker.com/gateway"),
    ).includes("SECRET"),
  );
});
test("short-call client supports long private Unix socket paths without truncation", async (t) => {
  if (process.platform !== "linux") return t.skip("Linux fd path support");
  const { open } = await import("node:fs/promises");
  const { tool } = await import("../client.mjs");
  const home = path.join(await temp(t), "private".repeat(18));
  await mkdir(home);
  const dir = await open(home, "r"), server = createServer((req, res) => {
    req.resume(); req.on("end", () => res.end(JSON.stringify({ result: { verified: true } })));
  });
  try {
    await new Promise((r, j) => { server.once("error", j); server.listen(`/proc/self/fd/${dir.fd}/host.sock`, r); });
    assert.deepEqual(await tool(path.join(home, "host.sock"), { operation: "identity" }), { verified: true });
  } finally { await new Promise(r => server.close(r)); await dir.close(); }
});
