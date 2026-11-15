import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
const script = fileURLToPath(
  new URL("./knowledge-worker.mjs", import.meta.url),
);
export function retrieve(request) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], {
      stdio: ["pipe", "pipe", "ignore"],
      env: process.env,
    });
    let output = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("KNOWLEDGE_TIMEOUT"));
    }, 10000);
    child.stdout.on("data", (b) => {
      output += b;
      if (output.length > 2000000) child.kill();
    });
    child.on("error", () => {
      clearTimeout(timer);
      reject(new Error("KNOWLEDGE_WORKER_FAILED"));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      try {
        if (code !== 0) throw 0;
        resolve(JSON.parse(output));
      } catch {
        reject(new Error("KNOWLEDGE_WORKER_FAILED"));
      }
    });
    child.stdin.end(JSON.stringify(request));
  });
}
