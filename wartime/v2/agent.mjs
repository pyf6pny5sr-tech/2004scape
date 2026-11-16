// Short current-agent command. Never calls a model or reads model login files.
import {
  prepare,
  ensure,
  discover,
  agentTool,
  defaultHome,
} from "./bootstrap.mjs";
import { randomUUID } from "node:crypto";
const args = process.argv.slice(2),
  command = args.shift() ?? "status",
  options = {};
let payload = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (["--home", "--world", "--gateway", "--bun", "--options"].includes(a)) {
    const v = args[++i];
    if (v === undefined) throw new Error("MISSING_OPTION_VALUE");
    options[a === "--options" ? "runOptions" : a.slice(2)] =
      a === "--options" ? JSON.parse(v) : v;
  } else payload.push(a);
}
function publicResult(value) {
  if (value && typeof value === "object" && value.prepared) {
    const { prepared, ...safe } = value;
    return {
      ...safe,
      prepared: {
        buildSha256: prepared.buildSha256,
        sdkCommit: prepared.sdkCommit,
        plannerMode: "current_agent",
        providerRequired: false,
      },
    };
  }
  return value;
}
try {
  let result;
  const home = options.home ?? defaultHome;
  if (command === "status") result = await discover(home);
  else if (command === "setup") result = await prepare(options);
  else if (command === "ensure" || command === "new")
    result = await ensure({ ...options, newRun: command === "new" });
  else if (command === "context")
    result = await agentTool(home, { operation: "agent_context" });
  else if (command === "tool")
    result = await agentTool(
      home,
      JSON.parse(payload.join(" ") || '{"operation":"status"}'),
    );
  else if (command === "request")
    result = await agentTool(home, {
      operation: "planner_request",
      context: JSON.parse(payload.join(" ") || "{}"),
    });
  else if (command === "complete") {
    const id = payload.shift();
    const proposal = JSON.parse(payload.join(" ") || "null");
    if (proposal) {
      proposal.id ??= randomUUID();
      proposal.expiresAt ??= Date.now() + 60000;
    }
    result = await agentTool(home, {
      operation: "planner_complete",
      id,
      proposal,
    });
  } else throw new Error("UNKNOWN_AGENT_COMMAND");
  console.log(JSON.stringify(publicResult(result), null, 2));
  if (["BLOCKED", "RUN_PROCESS_EXITED"].includes(result?.state))
    process.exitCode = 2;
} catch (e) {
  console.error(
    JSON.stringify({
      error: /^[A-Z0-9_]+$/.test(e.message)
        ? e.message
        : /^[A-Z0-9_]+$/.test(e.code ?? "")
          ? e.code
          : "AGENT_COMMAND_FAILED",
    }),
  );
  process.exitCode = 1;
}
