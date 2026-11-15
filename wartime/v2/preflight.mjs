// Read-only diagnostics: never sends sdk_connect, logs in, or creates an account.
import { readFile, stat } from "node:fs/promises";
import { identity } from "./protocol.mjs";
import { strictStatus } from "./ownership.mjs";
const path = process.argv[2];
if (!path) throw new Error("PRIVATE_CONFIG_PATH_REQUIRED");
const info = await stat(path);
if ((info.mode & 0o077) !== 0) throw new Error("CONFIG_MUST_BE_PRIVATE_0600");
const config = JSON.parse(await readFile(path, "utf8"));
const id = identity(config);
const status = await strictStatus(
  new URL("/status/" + encodeURIComponent(id.character), id.world).href,
);
let transport = "NOT_REQUESTED";
if (process.argv.includes("--transport"))
  transport = await new Promise((resolve) => {
    const ws = new WebSocket(id.gateway);
    const finish = (result) => {
      clearTimeout(timer);
      ws.close();
      resolve(result);
    };
    const timer = setTimeout(() => finish("TIMEOUT"), 8000);
    ws.onopen = () => finish("OPEN_NO_AUTH_HANDSHAKE");
    ws.onerror = () => finish("TRANSPORT_FAILED");
  });
console.log(
  JSON.stringify(
    {
      world: id.world,
      gateway: id.gateway,
      ownership: status,
      transport,
      accountHandshakeSent: false,
      limits:
        "A zero status is not an atomic ownership lease; an open unauthenticated socket is not an authenticated SDK session.",
    },
    null,
    2,
  ),
);
if (status.state === "UNKNOWN") process.exitCode = 2;
