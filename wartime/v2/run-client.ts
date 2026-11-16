// Minimal owned lite bridge. Uses pinned upstream client/session/queue APIs;
// intentionally has no host remapping, direct-port probing, fleet file or reconnect loop.
import { readFile, stat } from "node:fs/promises";
import { startSession } from "../../server/webclient/src/lite/session";
import { BotActionQueue } from "../../server/webclient/src/bot/ActionQueue";
import { strictStatus } from "./ownership.mjs";
const emit = (value: any) => process.stdout.write(JSON.stringify(value) + "\n");
for (const name of ["log", "info", "warn", "error", "debug"] as const)
  console[name] = () => {};
let session: any,
  ws: WebSocket,
  timer: any,
  ended = false;
const queue = new BotActionQueue();
let ticks = 0,
  wait = 0,
  logged = false,
  fresh = false,
  registered = false,
  gatewayReady = false,
  ready = false;
const stop = () => {
  if (ended) return;
  ended = true;
  clearInterval(timer);
  queue.clear();
  try {
    ws?.close();
    session?.stop();
  } catch {}
  setTimeout(() => process.exit(0), 50);
};
const failure = (code: string) => {
  if (ended) return;
  emit({
    type: "failure",
    code,
    evidence: { clientLoggedIn: logged, freshStateConfirmed: fresh },
  });
  stop();
};
process.stdin.resume();
process.stdin.on("end", stop);
process.stdin.on("data", (b) => {
  if (String(b).includes("stop")) stop();
});
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
try {
  const file = process.env.WARTIME_RUN_RECORD!,
    generation = Number(process.env.WARTIME_ACCOUNT_GENERATION);
  const info = await stat(file);
  if (info.mode & 0o077) throw new Error("RUN_RECORD_PERMISSIONS_UNSAFE");
  const record = JSON.parse(await readFile(file, "utf8")),
    account = record.accounts[generation];
  if (!account || record.activeGeneration !== generation)
    throw new Error("ACCOUNT_GENERATION_CHANGED");
  const origin = new URL(record.world),
    gateway = new URL(record.gateway);
  if (origin.hostname !== gateway.hostname)
    throw new Error("WORLD_GATEWAY_HOST_MISMATCH");
  session = await startSession({
    host: origin.host,
    secured: origin.protocol === "https:",
    username: account.character,
    password: account.password,
    quiet: true,
    loginJitterMs: 0,
    cacheDir: new URL("./client-cache/", new URL("file://" + file)).pathname,
  });
  logged = true;
  emit({ type: "logged_in" });
  const needsFresh = process.env.WARTIME_REQUIRE_FRESH === "true";
  const publish = () => {
    if (!gatewayReady || ended) return;
    const state = session.client.collectBotState(ticks);
    if (state) ws.send(JSON.stringify({ type: "state", state }));
  };
  const register = async () => {
    if (registered || ended) return;
    registered = true;
    const status = await strictStatus(
      new URL("/status/" + encodeURIComponent(account.character), record.world)
        .href,
    );
    if (
      status.state !== "ZERO" ||
      status.inGame ||
      status.clientStatus !== "dead"
    ) {
      failure(
        status.state === "UNKNOWN"
          ? "NETWORK_STATUS_UNKNOWN"
          : "OWNERSHIP_LOST",
      );
      return;
    }
    if (ended) return;
    ws = new WebSocket(record.gateway);
    ws.onopen = () => {
      if (ended) {
        ws.close();
        return;
      }
      ws.send(
        JSON.stringify({
          type: "connected",
          username: account.character,
          password: account.password,
          clientId: record.runId + "-" + generation,
          maxMessageLength: session.client.getMaxMessageLength(),
        }),
      );
    };
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(String(event.data));
        if (msg.type === "status" && msg.status === "Connected to gateway") {
          gatewayReady = true;
          queue.beginGeneration();
          publish();
          if (!ready) {
            ready = true;
            emit({
              type: "ready",
              evidence: {
                clientLoggedIn: true,
                freshStateConfirmed:
                  fresh || account.evidence.freshStateConfirmed === true,
                clientAttached: true,
              },
            });
          }
        } else if (msg.type === "action") {
          const q = queue.enqueue(
            { action: msg.action, actionId: msg.actionId ?? null },
            Math.max(0, (msg.actionTimeoutMs ?? 55000) - 1000),
          );
          if (!q && msg.actionId)
            ws.send(
              JSON.stringify({
                type: "actionResult",
                actionId: msg.actionId,
                result: { success: false, reason: "busy" },
              }),
            );
        } else if (msg.type === "save_and_disconnect")
          failure("OWNERSHIP_LOST");
        else if (msg.type === "error") failure("AUTH_BLOCKED");
        else if (msg.type === "screenshot_request")
          ws.send(
            JSON.stringify({
              type: "screenshot_response",
              dataUrl: "",
              screenshotId: msg.screenshotId,
            }),
          );
      } catch {
        failure("CLIENT_PROTOCOL_FAILED");
      }
    };
    ws.onerror = () => failure("NETWORK_TRANSPORT");
    ws.onclose = () => {
      if (!ended) failure("CLIENT_DISCONNECTED");
    };
  };
  session.client.setOnGameTickCallback(() => {
    ticks++;
    const state = session.client.collectBotState(ticks);
    if (!state?.inGame || !state.player) return;
    if (state.player.name.toLowerCase() !== account.character.toLowerCase()) {
      failure("CLIENT_CHARACTER_MISMATCH");
      return;
    }
    if (needsFresh && !fresh) {
      fresh =
        state.modalInterface === 3559 &&
        state.player.hp > 0 &&
        state.skills.length >= 18 &&
        state.inventory.length === 0 &&
        state.player.worldX >= 3050 &&
        state.player.worldX <= 3150 &&
        state.player.worldZ >= 3050 &&
        state.player.worldZ <= 3150 &&
        state.skills.every(
          (s: any) => s.name === "Hitpoints" || s.baseLevel === 1,
        );
      if (!fresh) {
        if (state.player.worldX >= 3200 || state.inventory.length > 0)
          failure("FRESH_CHARACTER_NOT_CONFIRMED");
        return;
      }
      emit({ type: "fresh_state_confirmed" });
    }
    void register().catch(() => failure("NETWORK_TRANSPORT"));
    publish();
  });
  const finish = (entry: any, result: any) => {
    if (ended || queue.active !== entry) return;
    const current = queue.isCurrentGeneration(entry);
    queue.complete(entry);
    if (current && entry.actionId)
      ws.send(
        JSON.stringify({
          type: "actionResult",
          actionId: entry.actionId,
          result,
        }),
      );
    publish();
  };
  timer = setInterval(() => {
    if (!gatewayReady || ended) return;
    for (const e of queue.expirePending())
      if (e.actionId)
        ws.send(
          JSON.stringify({
            type: "actionResult",
            actionId: e.actionId,
            result: { success: false, reason: "queue_expired" },
          }),
        );
    const expired = queue.expireActive();
    if (expired?.actionId)
      ws.send(
        JSON.stringify({
          type: "actionResult",
          actionId: expired.actionId,
          result: { success: false, reason: "queue_expired" },
        }),
      );
    if (wait > 0) {
      if (--wait === 0 && queue.active) finish(queue.active, { success: true });
      return;
    }
    if (queue.active) return;
    const entry = queue.startNext();
    if (!entry) return;
    const result = session.client.executeBotAction(entry.action);
    if (result instanceof Promise)
      result
        .then((r) => finish(entry, r))
        .catch(() =>
          finish(entry, { success: false, reason: "execution_error" }),
        );
    else if (entry.action.type === "wait" && result.success)
      wait = (entry.action as any).ticks || 1;
    else finish(entry, result);
  }, 20);
  void session.stopped.then((end: any) => {
    if (!ended)
      failure(
        end.reason === "stopped"
          ? "CLIENT_DISCONNECTED"
          : "CLIENT_DISCONNECTED",
      );
  });
} catch (e: any) {
  const code =
    e.code === 6
      ? "OUTDATED_CLIENT"
      : [7, 8, 9, 13, 14, 16].includes(e.code)
        ? e.code === 9 || e.code === 16
          ? "RATE_LIMIT"
          : "SERVER_UNAVAILABLE"
        : e.code === 3
          ? "OLD_LOGIN_AMBIGUOUS"
          : e.code === 5
            ? "OLD_LOGIN_AMBIGUOUS"
            : [4, 18].includes(e.code)
              ? "AUTH_BLOCKED"
              : "NETWORK_TRANSPORT";
  failure(code);
}
