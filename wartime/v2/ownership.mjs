// Never use SDK.checkBotStatus: its catch path fabricates controllers:[].
export async function strictStatus(url, fetcher = fetch) {
  try {
    const r = await fetcher(url, {
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok)
      return {
        state: "UNKNOWN",
        category:
          r.status === 401
            ? "AUTH"
            : r.status === 403
              ? "ACCESS_UNKNOWN"
              : "NETWORK",
        reason:
          r.status === 401
            ? "AUTH_REQUIRED"
            : r.status === 403
              ? "ACCESS_DENIED"
              : "HTTP_" + r.status,
      };
    const data = await r.json();
    if (
      !Array.isArray(data.controllers) ||
      !data.controllers.every((x) => typeof x === "string") ||
      typeof data.inGame !== "boolean" ||
      !["active", "stale", "dead"].includes(data.status)
    )
      return {
        state: "UNKNOWN",
        category: "PROTOCOL",
        reason: "INVALID_STATUS",
      };
    return {
      state: data.controllers.length ? "OCCUPIED" : "ZERO",
      inGame: data.inGame,
      controllers: data.controllers.length,
    };
  } catch {
    return {
      state: "UNKNOWN",
      category: "NETWORK",
      reason: "TRANSPORT_OR_REDIRECT",
    };
  }
}
export function authorizeStartup(config, status) {
  const h = config.handoff;
  if (
    !h?.previousOwnerStopped ||
    !h?.acceptNonAtomicGatewayRisk ||
    h.world !== config.world ||
    h.character !== config.character
  )
    throw new Error("EXPLICIT_STARTUP_HANDOFF_REQUIRED");
  if (status.state === "UNKNOWN")
    throw new Error((status.category ?? "NETWORK") + "_STATUS_UNKNOWN");
  if (status.state !== "ZERO") throw new Error("OWNERSHIP_" + status.state);
  if (!status.inGame) throw new Error("ATTACHED_CLIENT_REQUIRED");
  // Last-controller-wins has no compare-and-swap. This does not claim atomicity.
}
