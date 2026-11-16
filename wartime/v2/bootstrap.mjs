// Online client/controller preparation only. No engine, model provider or auth setup.
import {
  mkdir,
  readFile,
  writeFile,
  cp,
  rename,
  rm,
  readdir,
  stat,
} from "node:fs/promises";
import { execFile, spawn, spawnSync } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { randomBytes, createHash } from "node:crypto";
import { sourceIdentity } from "./identity.mjs";
import { tool } from "./client.mjs";
import { atomicPrivate, processStamp, runId, runConfig } from "./run-store.mjs";
import { dataDirectory } from "../knowledge.mjs";
const exec = promisify(execFile);
export const SDK_COMMIT = "3aa493c3d26680df5bae2b475cc1805e3db05ae3";
export const SDK_URL = "https://github.com/MaxBittker/rs-sdk.git";
export const defaultHome = path.join(dataDirectory, "agent-runtime");
const sourceWartime = fileURLToPath(new URL("../", import.meta.url));
const error = (code) => {
  throw new Error(code);
};
async function json(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (e) {
    if (e.code === "ENOENT") return null;
    throw e;
  }
}
export function onlineConfig(options = {}, existing) {
  const world =
      options.world ?? existing?.world ?? "https://rs-sdk.maxbittker.com",
    gateway =
      options.gateway ??
      existing?.gateway ??
      "wss://rs-sdk.maxbittker.com/gateway";
  if (
    new URL(world).protocol !== "https:" ||
    new URL(gateway).protocol !== "wss:"
  )
    error("ONLINE_TLS_ENDPOINTS_REQUIRED");
  return runConfig({ ...options.runOptions, world, gateway });
}
function paths(home) {
  return {
    home,
    sdk: path.join(home, "sdk"),
    manifest: path.join(home, "prepared.json"),
    marker: path.join(home, "owner.json"),
    active: path.join(home, "active.json"),
    config: path.join(home, "run-config.json"),
  };
}
export function verifyRuntime(observed, prepared, active) {
  const i = observed?.implementation;
  if (
    !i ||
    !i.moduleSha256 ||
    createHash("sha256")
      .update(JSON.stringify(i.moduleSha256))
      .digest("hex") !== i.buildSha256 ||
    i.implementation !== "wartime-v2" ||
    i.identityProtocol !== 1 ||
    i.buildSha256 !== prepared.buildSha256 ||
    i.sdkCommit !== SDK_COMMIT ||
    JSON.stringify(i.sdkModuleSha256) !==
      JSON.stringify(prepared.sdkModuleSha256) ||
    observed.runId !== active.runId ||
    observed.world !== prepared.world ||
    observed.gateway !== prepared.gateway
  )
    error("UNVERIFIED_RUNTIME_IDENTITY");
  return true;
}
export async function discover(home = defaultHome, { request = tool } = {}) {
  const p = paths(path.resolve(home)),
    prepared = await json(p.manifest),
    active = await json(p.active);
  if (!prepared) return { state: "NOT_PREPARED", home: p.home };
  if (!active) return { state: "PREPARED", home: p.home, prepared };
  if (
    !/^r[a-f0-9]{32}$/.test(active.runId) ||
    active.socket !== path.join(p.home, "runs", active.runId, "host.sock")
  )
    error("INVALID_RUNTIME_POINTER");
  let owner =
    active.pid && active.start
      ? { pid: active.pid, start: active.start }
      : await json(
          path.join(p.home, "runs", active.runId, "owner.lock", "owner.json"),
        );
  if (!owner || (await processStamp(owner.pid)) !== owner.start)
    return {
      state: "STOPPED_OR_INTERRUPTED",
      home: p.home,
      runId: active.runId,
      prepared,
    };
  try {
    const runtime = await request(active.socket, { operation: "identity" });
    verifyRuntime(runtime, prepared, active);
    const checkout = await sourceIdentity();
    return {
      state: "RUNNING",
      home: p.home,
      runId: active.runId,
      socket: active.socket,
      character: runtime.character,
      runtime,
      matchesCheckout:
        runtime.implementation.buildSha256 === checkout.buildSha256,
      updateAvailable:
        runtime.implementation.buildSha256 !== checkout.buildSha256,
      prepared,
    };
  } catch (e) {
    return {
      state: "ACTIVE_UNVERIFIED_OR_STARTING",
      home: p.home,
      runId: active.runId,
      reason:
        e.message === "UNVERIFIED_RUNTIME_IDENTITY"
          ? e.message
          : "BRIDGE_UNREACHABLE",
      prepared,
    };
  }
}
async function command(file, args, cwd, env = process.env) {
  try {
    return await exec(file, args, {
      cwd,
      env,
      maxBuffer: 4000000,
      timeout: 180000,
    });
  } catch (e) {
    const text = String(e.stderr ?? "");
    error(
      /403|policy|denied/i.test(text)
        ? "SETUP_NETWORK_ACCESS_DENIED"
        : "SETUP_COMMAND_FAILED",
    );
  }
}
function bunExecutable(options) {
  const candidate = options.bun ?? process.env.BUN_EXECUTABLE ?? "bun";
  const r = spawnSync(candidate, ["--version"], { encoding: "utf8" });
  if (r.status !== 0 || !/^1\.(?:[4-9]|\d{2,})\./.test(r.stdout.trim()))
    error("BUN_1_4_OR_LATER_REQUIRED");
  return candidate;
}
async function copyPublicSource(dest) {
  await mkdir(dest, { recursive: true, mode: 0o700 });
  for (const entry of await readdir(sourceWartime)) {
    if (
      entry === ".wartime" ||
      entry === "node_modules" ||
      entry.startsWith(".env")
    )
      continue;
    await cp(path.join(sourceWartime, entry), path.join(dest, entry), {
      recursive: true,
      filter: (src) =>
        !src
          .split(path.sep)
          .some(
            (x) =>
              x === ".wartime" || x === "node_modules" || x.startsWith(".env"),
          ),
    });
  }
}

async function unrelatedDefaultRun() {
  const root = path.join(dataDirectory, "runs");
  let names;
  try {
    names = await readdir(root);
  } catch (e) {
    if (e.code === "ENOENT") return null;
    throw e;
  }
  for (const id of names) {
    if (!/^r[a-f0-9]{32}$/.test(id)) continue;
    const owner = await json(path.join(root, id, "owner.lock", "owner.json"));
    if (owner && (await processStamp(owner.pid)) === owner.start)
      return { id, socket: path.join(root, id, "host.sock") };
  }
  return null;
}
export async function prepare(options = {}, deps = {}) {
  const home = path.resolve(options.home ?? defaultHome),
    p = paths(home);
  let current = await discover(home, deps);
  if (
    current.state === "RUNNING" ||
    current.state === "ACTIVE_UNVERIFIED_OR_STARTING"
  )
    return current;
  const foreign = await unrelatedDefaultRun();
  if (foreign)
    return {
      state: "EXISTING_PROJECT_RUN_DETECTED",
      runId: foreign.id,
      socket: foreign.socket,
      reason:
        "Preserve the active run; inspect its identity before any explicit adoption/restart.",
    };
  const previousConfig = current.prepared ? await json(p.config) : null;
  const selected = onlineConfig({ ...options, runOptions: options.runOptions ?? previousConfig }, current.prepared);
  if (
    current.prepared &&
    (selected.world !== current.prepared.world ||
      selected.gateway !== current.prepared.gateway)
  )
    error("EXPLICIT_WORLD_CONFIG_CHANGED_USE_SEPARATE_HOME");
  const bun = deps.findBun ? deps.findBun(options) : bunExecutable(options);
  if (Number(process.versions.node.split(".")[0]) < 24)
    error("NODE_24_REQUIRED");
  await mkdir(home, { recursive: true, mode: 0o700 });
  let marker = await json(p.marker);
  if (!marker) {
    if ((await readdir(home)).length) error("RUNTIME_HOME_NOT_OWNED");
    await atomicPrivate(
      p.marker,
      {
        schemaVersion: 1,
        kind: "wartime-online-agent",
        nonce: randomBytes(16).toString("hex"),
      },
      true,
    );
  } else if (marker.kind !== "wartime-online-agent")
    error("RUNTIME_HOME_NOT_OWNED");
  const guard = path.join(home, "setup.lock");
  try {
    await mkdir(guard, { mode: 0o700 });
  } catch {
    error("SETUP_ALREADY_IN_PROGRESS");
  }
  let stage;
  try {
    current = await discover(home, deps);
    if (
      current.state === "RUNNING" ||
      current.state === "ACTIVE_UNVERIFIED_OR_STARTING"
    )
      return current;
    const source = await sourceIdentity();
    const run = deps.command ?? command;
    if (!current.prepared) {
      try {
        await stat(p.sdk);
        error("SDK_DIRECTORY_NOT_OWNED");
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
      stage = path.join(home, "sdk-stage-" + randomBytes(8).toString("hex"));
      await mkdir(stage, { mode: 0o700 });
      await run("git", ["init", "-q"], stage);
      await run("git", ["remote", "add", "origin", SDK_URL], stage);
      await run("git", ["sparse-checkout", "init", "--cone"], stage);
      await run(
        "git",
        [
          "sparse-checkout",
          "set",
          "sdk",
          "mcp",
          "server/webclient",
          "server/vendor",
        ],
        stage,
      );
      await run(
        "git",
        ["fetch", "--depth=1", "--filter=blob:none", "origin", SDK_COMMIT],
        stage,
        { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      );
      await run("git", ["checkout", "--detach", "FETCH_HEAD"], stage);
      const actual = (
        await run("git", ["rev-parse", "HEAD"], stage)
      ).stdout.trim();
      if (actual !== SDK_COMMIT) error("SDK_PIN_MISMATCH");
      const env = { ...process.env, PUPPETEER_SKIP_DOWNLOAD: "1" };
      await run(bun, ["install", "--frozen-lockfile"], stage, env);
      await run(
        bun,
        ["install", "--frozen-lockfile"],
        path.join(stage, "server/webclient"),
        env,
      );
      await copyPublicSource(path.join(stage, "wartime"));
      await run(process.execPath, ["wartime/setup-knowledge.mjs"], stage, {
        ...process.env,
        NODE_USE_ENV_PROXY: "1",
      });
      await rename(stage, p.sdk);
      stage = null;
    } else {
      const actual = (
        await run("git", ["rev-parse", "HEAD"], p.sdk)
      ).stdout.trim();
      if (actual !== SDK_COMMIT) error("SDK_PIN_MISMATCH");
      if (current.prepared.buildSha256 !== source.buildSha256)
        await copyPublicSource(path.join(p.sdk, "wartime"));
    }
    const installed = deps.installedIdentity
      ? null
      : await import(
          pathToFileURL(path.join(p.sdk, "wartime/v2/identity.mjs")).href +
            "?capture=" +
            Date.now()
        );
    const implementation = deps.installedIdentity
      ? await deps.installedIdentity()
      : await installed.runtimeIdentity();
    if (
      implementation.buildSha256 !== source.buildSha256 ||
      implementation.sdkCommit !== SDK_COMMIT
    )
      error("PREPARED_SOURCE_MISMATCH");
    const config = { ...selected, runtimeRoot: path.join(home, "runs") };
    delete config.bun;
    await atomicPrivate(p.config, config);
    const prepared = {
      schemaVersion: 1,
      world: selected.world,
      gateway: selected.gateway,
      sdkCommit: SDK_COMMIT,
      sdkDir: p.sdk,
      bun,
      buildSha256: implementation.buildSha256,
      sdkModuleSha256: implementation.sdkModuleSha256,
      preparedAt: new Date().toISOString(),
      plannerMode: "current_agent",
      providerRequired: false,
    };
    await atomicPrivate(p.manifest, prepared);
    return { state: "PREPARED", home, prepared };
  } finally {
    if (stage) await rm(stage, { recursive: true, force: true });
    await rm(guard, { recursive: true, force: true });
  }
}
export async function ensure(options = {}, deps = {}) {
  const home = path.resolve(options.home ?? defaultHome),
    p = paths(home);
  const preparedState = await prepare(options, deps);
  if (preparedState.state !== "PREPARED") {
    if (options.newRun && preparedState.state === "RUNNING")
      error("ACTIVE_RUN_MUST_BE_STOPPED_FIRST");
    return preparedState;
  }
  const guard = path.join(home, "launch.lock");
  try {
    await mkdir(guard, { mode: 0o700 });
  } catch {
    return { state: "STARTUP_IN_PROGRESS", home };
  }
  try {
    const current = await discover(home, deps);
    if (["RUNNING", "ACTIVE_UNVERIFIED_OR_STARTING"].includes(current.state))
      return current;
    const existing = await json(p.active);
    if (options.newRun && existing && current.state === "RUNNING")
      error("ACTIVE_RUN_MUST_BE_STOPPED_FIRST");
    const id = options.newRun || !existing ? runId() : existing.runId;
    const record = await json(path.join(home, "runs", id, "run.json"));
    const mode = record ? "resume" : "new";
    const active = {
      runId: id,
      socket: path.join(home, "runs", id, "host.sock"),
      world: preparedState.prepared.world,
      gateway: preparedState.prepared.gateway,
      state: "LAUNCH_INTENT",
    };
    await atomicPrivate(p.active, active);
    const out = await import("node:fs");
    const log = out.openSync(path.join(home, "run-output.jsonl"), "a", 0o600);
    const child = spawn(
      preparedState.prepared.bun,
      [
        path.join(p.sdk, "wartime/v2/run.ts"),
        mode,
        ...(mode === "resume" ? [id] : []),
      ],
      {
        cwd: p.sdk,
        detached: true,
        stdio: ["ignore", log, log],
        env: {
          ...process.env,
          GATEWAY_DIRECT: "false",
          WARTIME_RUN_CONFIG: p.config,
          WARTIME_NEW_RUN_ID: id,
        },
      },
    );
    out.closeSync(log);
    const childStarted = new Promise((resolve, reject) => {
      child.once("spawn", resolve);
      child.once("error", () => reject(new Error("RUN_PROCESS_UNAVAILABLE")));
    });
    await childStarted;
    active.pid = child.pid;
    active.start = await processStamp(child.pid);
    active.state = "STARTING";
    await atomicPrivate(p.active, active);
    child.unref();
    const deadline =
      Date.now() +
      Math.min(150000, preparedState.prepared.startupTimeoutMs ?? 65000);
    while (Date.now() < deadline) {
      const s = await discover(home, deps);
      if (s.state === "RUNNING") return s;
      const record = await json(path.join(home, "runs", id, "run.json"));
      if (record && ["BLOCKED", "CANCELLED", "STOPPED"].includes(record.status))
        return {
          state: record.status,
          runId: id,
          reason: record.lastError ?? record.status,
          home,
        };
      if ((await processStamp(active.pid)) !== active.start)
        return {
          state: "RUN_PROCESS_EXITED",
          runId: id,
          reason: record?.lastError ?? "UNKNOWN_STARTUP_FAILURE",
          home,
        };
      await new Promise((r) => setTimeout(r, 100));
    }
    return {
      state: "STARTING",
      runId: id,
      home,
      reason: "READINESS_PENDING_NO_DUPLICATE_START",
    };
  } finally {
    await rm(guard, { recursive: true, force: true });
  }
}
export async function agentTool(home, request, deps = {}) {
  const current = await discover(home, deps);
  if (current.state !== "RUNNING") error(current.state);
  return (deps.request ?? tool)(current.socket, request);
}
