// Top-level run launcher. Identity and credentials are generated and stored privately.
import { readFile, stat } from "node:fs/promises";
import { RunManager } from "./run-manager.mjs";
import { RunError } from "./run-store.mjs";
import { runtime } from "./run-runtime";
export async function startRun(config: any, options: any = {}) {
  return new RunManager(config, options, runtime).start();
}
if (import.meta.main) {
  const output = (v: any) => process.stdout.write(JSON.stringify(v) + "\n");
  for (const k of ["log", "info", "warn", "error", "debug"] as const)
    console[k] = () => {};
  let manager: any;
  const abort = new AbortController();
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    abort.abort(new RunError("RUN_CANCELLED"));
    if (manager) await manager.close();
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  try {
    if (process.env.GATEWAY_DIRECT !== "false")
      throw new RunError("SET_GATEWAY_DIRECT_FALSE_TO_PRESERVE_ENDPOINT");
    const [mode = "new", id] = process.argv.slice(2);
    if (
      !["new", "resume"].includes(mode) ||
      (mode === "resume" && !id) ||
      (mode === "new" && id)
    )
      throw new RunError("USAGE_NEW_OR_RESUME_RUN_ID");
    const file = process.env.WARTIME_RUN_CONFIG;
    if (!file) throw new RunError("PRIVATE_RUN_CONFIG_REQUIRED");
    if ((await stat(file)).mode & 0o077)
      throw new RunError("CONFIG_MUST_BE_PRIVATE_0600");
    const config = JSON.parse(await readFile(file, "utf8"));
    runtime.onStatus = output;
    manager = new RunManager(
      config,
      { mode, runId: id, signal: abort.signal },
      runtime,
    );
    await manager.start();
  } catch (e: any) {
    output({
      ...(manager?.store?.record ? manager.store.summary() : {}),
      status: e.code === "RUN_ALREADY_ACTIVE" ? "ALREADY_RUNNING" : "BLOCKED",
      reason: e instanceof RunError ? e.code : "RUN_START_FAILED",
    });
    process.exitCode = 1;
  }
}
