// Use only the environment's preconfigured route. Never print proxy values.
const installed = Symbol.for("wartime.managedWebSocket");
function bypasses(url, value) {
  const u = new URL(url),
    host = u.hostname.toLowerCase(),
    port = u.port || (u.protocol === "wss:" ? "443" : "80");
  return String(value ?? "")
    .split(",")
    .some((raw) => {
      let s = raw.trim().toLowerCase();
      if (!s) return false;
      if (s === "*") return true;
      const colon = s.lastIndexOf(":");
      if (colon > 0 && !s.includes("]")) {
        const p = s.slice(colon + 1);
        if (/^\d+$/.test(p)) {
          if (p !== port) return false;
          s = s.slice(0, colon);
        }
      }
      s = s.replace(/^\*\./, ".");
      return s.startsWith(".")
        ? host === s.slice(1) || host.endsWith(s)
        : host === s;
    });
}
export function socketRoute(url, env = process.env) {
  const u = new URL(url);
  if (bypasses(url, env.NO_PROXY ?? env.no_proxy))
    return { proxy: null, mode: "environment_no_proxy" };
  const proxy =
    u.protocol === "wss:"
      ? (env.HTTPS_PROXY ?? env.https_proxy ?? env.HTTP_PROXY ?? env.http_proxy)
      : (env.HTTP_PROXY ?? env.http_proxy);
  return {
    proxy: proxy || null,
    mode: proxy ? "environment_configured_proxy" : "environment_direct",
  };
}
export function installManagedWebSocketProxy({
  target = globalThis,
  env = process.env,
  allowTest = false,
} = {}) {
  if (target[installed]) return target[installed];
  if (!target.Bun && !allowTest) return { installed: false, mode: "not_bun" };
  const Native = target.WebSocket;
  class ManagedWebSocket extends Native {
    constructor(url, protocolsOrOptions) {
      const options =
        protocolsOrOptions &&
        typeof protocolsOrOptions === "object" &&
        !Array.isArray(protocolsOrOptions)
          ? { ...protocolsOrOptions }
          : protocolsOrOptions === undefined
            ? {}
            : {
                protocols:
                  typeof protocolsOrOptions === "string"
                    ? [protocolsOrOptions]
                    : protocolsOrOptions,
              };
      const route = socketRoute(url, env);
      if (options.proxy !== undefined && options.proxy !== route.proxy)
        throw new Error("WEBSOCKET_PROXY_OVERRIDE_NOT_ALLOWED");
      if (route.proxy) options.proxy = route.proxy;
      super(url, options);
    }
  }
  target.WebSocket = ManagedWebSocket;
  const info = Object.freeze({
    installed: true,
    mode: "managed_environment_only",
    tlsVerification: "unchanged",
  });
  target[installed] = info;
  return info;
}
export function transportSummary(url) {
  const r = socketRoute(url);
  return {
    route: r.mode,
    proxyConfigured: !!r.proxy,
    tlsVerification: "unchanged",
    endpoint: new URL(url).origin,
  };
}
