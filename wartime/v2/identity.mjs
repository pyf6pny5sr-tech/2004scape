import { readFile, realpath } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import path from "node:path";
const exec = promisify(execFile);
export const CODE_FILES = [
  "adapter.ts",
  "client.mjs",
  "executor.mjs",
  "host.ts",
  "identity.mjs",
  "knowledge-worker.mjs",
  "knowledge.mjs",
  "managed-websocket.mjs",
  "protocol.mjs",
  "ownership.mjs",
  "run.ts",
  "run-store.mjs",
  "run-manager.mjs",
  "run-runtime.ts",
  "run-client.ts",
  "versions/steady.mjs",
  "versions/cautious.mjs",
  "../memory.mjs",
  "../knowledge.mjs",
  "../controller.mjs",
];
export async function sourceIdentity(base = new URL("./", import.meta.url)) {
  const moduleSha256 = {};
  for (const name of CODE_FILES)
    moduleSha256[name] = createHash("sha256")
      .update(await readFile(new URL(name, base)))
      .digest("hex");
  const buildSha256 = createHash("sha256")
    .update(JSON.stringify(moduleSha256))
    .digest("hex");
  return {
    implementation: "wartime-v2",
    identityProtocol: 1,
    buildSha256,
    moduleSha256,
  };
}
export async function runtimeIdentity() {
  const source = await sourceIdentity();
  let sdkCommit = null;
  const sdkModuleSha256 = {};
  try {
    const sdkRoot = path.dirname(
      path.dirname(
        await realpath(
          fileURLToPath(new URL("../../sdk/index.ts", import.meta.url)),
        ),
      ),
    );
    sdkCommit = (
      await exec("git", ["rev-parse", "HEAD"], { cwd: sdkRoot })
    ).stdout.trim();
    for (const f of [
      "sdk/index.ts",
      "sdk/actions.ts",
      "sdk/execution-context.ts",
      "server/webclient/src/lite/session.ts",
      "server/webclient/src/lite/net/GameConnection.ts",
    ])
      sdkModuleSha256[f] = createHash("sha256")
        .update(await readFile(path.join(sdkRoot, f)))
        .digest("hex");
  } catch {}
  return Object.freeze({
    ...source,
    sdkCommit,
    sdkModuleSha256,
    capturedAt: new Date().toISOString(),
    meaning:
      "Computed from runtime module files at startup, not a configurable label. Local file/build identity, not remote cryptographic attestation.",
  });
}
