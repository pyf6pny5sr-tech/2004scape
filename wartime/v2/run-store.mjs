import { randomBytes } from "node:crypto";
import { mkdir, open, readFile, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { identity, bounded } from "./protocol.mjs";
import { dataDirectory } from "../knowledge.mjs";
export class RunError extends Error {
  constructor(code, evidence) {
    super(code);
    this.code = code;
    this.evidence = evidence;
  }
}
export const fail = (code) => {
  throw new RunError(code);
};
function randomText(length, alphabet) {
  let out = "";
  const max = 256 - (256 % alphabet.length);
  while (out.length < length)
    for (const n of randomBytes(length * 2)) {
      if (n < max) out += alphabet[n % alphabet.length];
      if (out.length === length) break;
    }
  return out;
}
export const credentials = () => ({
  character: randomText(12, "abcdefghijklmnopqrstuvwxyz0123456789"),
  password: randomText(
    20,
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
  ),
});
export const runId = () => "r" + randomBytes(16).toString("hex");
export function runConfig(input) {
  if (
    input.character !== undefined ||
    input.password !== undefined ||
    input.handoff !== undefined
  )
    fail("NEW_RUN_CONFIG_MUST_OMIT_CHARACTER_PASSWORD_HANDOFF");
  if(input.rangeTank!==undefined&&typeof input.rangeTank!=="boolean")fail("INVALID_RANGE_TANK_CONFIG");
  if(input.scoring!==undefined&&(typeof input.scoring!=="object"||typeof input.scoring.enabled!=="boolean"))fail("INVALID_SCORING_CONFIG");
  const id = identity({ ...input, character: "validation" });
  const c = {
    ...input,
    world: id.world,
    gateway: id.gateway,
    runtimeRoot: input.runtimeRoot ?? path.join(dataDirectory, "runs"),
    startupTimeoutMs: input.startupTimeoutMs ?? 45000,
    reconnectTimeoutMs: input.reconnectTimeoutMs ?? 8000,
    reconnectAttempts: input.reconnectAttempts ?? 2,
    maxAutomaticReplacements: input.maxAutomaticReplacements ?? 1,
    onboarding: input.onboarding ?? "skip_tutorial",
  };
  delete c.church;delete c.safety;delete c.stagedVersions;
  if (!path.isAbsolute(c.runtimeRoot)) fail("ABSOLUTE_RUNTIME_ROOT_REQUIRED");
  bounded(c.startupTimeoutMs, 1000, 120000, "STARTUP_TIMEOUT");
  bounded(c.reconnectTimeoutMs, 1000, 30000, "RECONNECT_TIMEOUT");
  bounded(c.reconnectAttempts, 1, 3, "RECONNECT_ATTEMPTS");
  bounded(c.maxAutomaticReplacements, 0, 1, "ACCOUNT_REPLACEMENTS");
  if (!["skip_tutorial", "observe"].includes(c.onboarding))
    fail("INVALID_ONBOARDING");
  return c;
}
export async function atomicPrivate(file, value, exclusive = false) {
  const temp = exclusive
    ? file
    : file + "." + randomBytes(8).toString("hex") + ".part";
  const handle = await open(temp, "wx", 0o600);
  try {
    await handle.writeFile(JSON.stringify(value, null, 2) + "\n");
    await handle.sync();
  } finally {
    await handle.close();
  }
  if (!exclusive) await rename(temp, file);
  const dir = await open(path.dirname(file), "r");
  try {
    await dir.sync();
  } finally {
    await dir.close();
  }
}
export async function processStamp(pid) {
  try {
    const s = await readFile(`/proc/${pid}/stat`, "utf8");
    const fields = s.slice(s.lastIndexOf(")") + 2).split(" ");
    return fields[0] === "Z" ? null : fields[19];
  } catch (e) {
    if (e.code === "ENOENT" || e.code === "ESRCH") return null;
    fail("PROCESS_IDENTITY_UNKNOWN");
  }
}
export class RunStore {
  constructor(config, id) {
    if (!/^r[a-f0-9]{32}$/.test(id)) fail("INVALID_RUN_ID");
    this.config = config;
    this.id = id;
    this.dir = path.join(config.runtimeRoot, id);
    this.file = path.join(this.dir, "run.json");
  }
  async create() {
    await mkdir(this.config.runtimeRoot, { recursive: true, mode: 0o700 });
    await mkdir(this.dir, { mode: 0o700 });
    const account = {
      ...credentials(),
      generation: 0,
      status: "PRIVATE_CONFIG_CREATED",
      reconnectAttemptsUsed: 0,
      evidence: { privateConfigCreated: true, loginAttempted: false },
    };
    this.record = {
      schemaVersion: 1,
      runId: this.id,
      world: this.config.world,
      gateway: this.config.gateway,
      createdAt: new Date().toISOString(),
      status: "PRIVATE_CONFIG_CREATED",
      activeGeneration: 0,
      replacementsUsed: 0,
      collisionRetriesUsed: 0,
      reconnectLimit: this.config.reconnectAttempts,
      replacementLimit: this.config.maxAutomaticReplacements,
      accounts: [account],
    };
    await atomicPrivate(this.file, this.record, true);
    return this.record;
  }
  async load() {
    const info = await stat(this.file);
    if (info.mode & 0o077) fail("RUN_RECORD_PERMISSIONS_UNSAFE");
    if (info.size > 1000000) fail("RUN_RECORD_INVALID");
    this.record = JSON.parse(await readFile(this.file, "utf8"));
    const r = this.record,
      integer = (n, lo, hi) => Number.isSafeInteger(n) && n >= lo && n <= hi;
    if (
      r.schemaVersion !== 1 ||
      !integer(r.replacementLimit, 0, 1) ||
      !integer(r.reconnectLimit, 1, 3) ||
      !integer(r.replacementsUsed, 0, r.replacementLimit) ||
      !integer(r.collisionRetriesUsed, 0, 2) ||
      !Array.isArray(r.accounts) ||
      !integer(r.accounts.length, 1, 4) ||
      r.activeGeneration !== r.accounts.length - 1 ||
      r.accounts.some(
        (a, i) =>
          a.generation !== i ||
          !/^[a-z0-9]{12}$/.test(a.character) ||
          !/^[A-Za-z0-9]{20}$/.test(a.password) ||
          !integer(a.reconnectAttemptsUsed, 0, r.reconnectLimit) ||
          !integer(a.reconnectAttemptsTotal ?? 0, 0, Number.MAX_SAFE_INTEGER) ||
          !a.evidence ||
          typeof a.evidence.loginAttempted !== "boolean",
      )
    )
      fail("RUN_RECORD_INVALID");

    if (
      this.record.runId !== this.id ||
      this.record.world !== this.config.world ||
      this.record.gateway !== this.config.gateway
    )
      fail("RUN_WORLD_IDENTITY_CHANGED");
    return this.record;
  }
  async save() {
    await atomicPrivate(this.file, this.record);
  }
  get account() {
    return this.record.accounts[this.record.activeGeneration];
  }
  summary() {
    return {
      runId: this.id,
      character: this.account.character,
      status: this.record.status,
      generation: this.record.activeGeneration,
      replacementsUsed: this.record.replacementsUsed,
      socket: path.join(this.dir, "host.sock"),
      world: this.record.world,
    };
  }
  async acquire(resume = false) {
    const guard = path.join(this.dir, "startup.guard");
    try {
      await mkdir(guard, { mode: 0o700 });
    } catch {
      fail("RUN_STARTUP_BUSY");
    }
    const lock = path.join(this.dir, "owner.lock");
    try {
      try {
        const old = JSON.parse(
          await readFile(path.join(lock, "owner.json"), "utf8"),
        );
        if ((await processStamp(old.pid)) === old.start)
          fail("RUN_ALREADY_ACTIVE");
        if (!resume) fail("RUN_REQUIRES_EXPLICIT_RESUME");
        await rm(lock, { recursive: true });
        this.previousOwner = old;
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
        try {
          await stat(lock);
          fail("RUN_OWNER_UNKNOWN");
        } catch (x) {
          if (x.code !== "ENOENT") throw x;
        }
      }
      await mkdir(lock, { mode: 0o700 });
      this.owner = {
        pid: process.pid,
        start: await processStamp(process.pid),
        token: randomBytes(16).toString("hex"),
      };
      await atomicPrivate(path.join(lock, "owner.json"), this.owner, true);
      this.lock = lock;
    } finally {
      await rm(guard, { recursive: true });
    }
  }
  async release() {
    if (!this.lock) return;
    const owner = JSON.parse(
      await readFile(path.join(this.lock, "owner.json"), "utf8"),
    );
    if (owner.token !== this.owner.token) fail("RUN_OWNER_CHANGED");
    await rm(this.lock, { recursive: true });
    this.lock = null;
  }
  appendIdentity(reason) {
    const old = this.account;
    old.status = reason;
    this.record.activeGeneration++;
    const account = {
      ...credentials(),
      generation: this.record.activeGeneration,
      status: "PRIVATE_CONFIG_CREATED",
      reconnectAttemptsUsed: 0,
      evidence: { privateConfigCreated: true, loginAttempted: false },
    };
    this.record.accounts.push(account);
    return account;
  }
}
