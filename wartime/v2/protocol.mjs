import {
  validateStep,
  validateExpectation,
  checkExpectation,
} from "../controller.mjs";
export { checkExpectation };
// SDK state is exposed through read-only Proxies; structuredClone rejects them.
export const copy = (v) =>
  v === undefined ? undefined : JSON.parse(JSON.stringify(v));
export const bounded = (n, min, max, label) => {
  if (!Number.isSafeInteger(n) || n < min || n > max)
    throw new Error("INVALID_" + label);
  return n;
};
const extras = new Set([
  "attack_player",
  "attack_npc",
  "prayer_on",
  "prayer_off",
  "combat_style",
  "escape",
]);
export function validateCommand(c) {
  if(c?.target?.exact!==undefined&&typeof c.target.exact!=="boolean")throw Error("INVALID_EXACT_TARGET");
  if(c?.target?.exact){bounded(c.target.x,0,16383,"TARGET_X");bounded(c.target.z,0,16383,"TARGET_Z");}
  if (!c || typeof c !== "object") throw new Error("INVALID_COMMAND");
  if(c.resourceFireMove!==undefined&&c.resourceFireMove!==true)throw Error('INVALID_RESOURCE_MOVE');
  if(c.avoidTiles!==undefined){if(!Array.isArray(c.avoidTiles)||c.avoidTiles.length>64)throw Error('INVALID_AVOID_TILES');for(const t of c.avoidTiles){bounded(t.x,0,16383,'AVOID_X');bounded(t.z,0,16383,'AVOID_Z');}}
  if(c.action==='burn_logs'&&(!c.item||(!c.item.name&&c.item.id===undefined)))throw Error('BURN_ITEM_SELECTOR_REQUIRED');
  if (!extras.has(c.action)) validateStep(c);
  else {
    if (!Array.isArray(c.expect) || !c.expect.length || c.expect.length > 5)
      throw new Error("INVALID_EXPECTATIONS");
    for (const e of c.expect)
      if (!["prayer", "combat_target", "combat_style"].includes(e.type))
        validateExpectation(e);
      else {
        if (e.type === "prayer") {
          bounded(e.index, 0, 14, "PRAYER");
          if (typeof e.active !== "boolean") throw new Error("INVALID_PRAYER");
        }
        if (e.type === "combat_style") bounded(e.style, 0, 3, "STYLE");
        if (e.type === "combat_target") {
          if (!["npc", "player"].includes(e.kind))
            throw new Error("INVALID_TARGET_KIND");
          bounded(e.index, 0, 32767, "INDEX");
        }
      }
    if (c.action.startsWith("prayer_")) bounded(c.index, 0, 14, "PRAYER");
    if (c.action === "combat_style") bounded(c.style, 0, 3, "STYLE");
    if (c.action === "escape") {
      bounded(c.x, 0, 16383, "X");
      bounded(c.z, 0, 16383, "Z");
      bounded(c.level, 0, 3, "PLANE");
    }
  }
  if (c.action === "attack_player" || c.action === "attack_npc") {
    if (c.target?.kind !== (c.action === "attack_player" ? "player" : "npc"))
      throw new Error("EXPLICIT_COMBAT_TARGET_KIND_REQUIRED");
    if (c.target.index !== undefined)
      bounded(c.target.index, 0, 32767, "INDEX");
    if (
      c.target.name !== undefined &&
      (typeof c.target.name !== "string" ||
        !c.target.name ||
        c.target.name.length > 30)
    )
      throw new Error("INVALID_TARGET_NAME");
    if (c.target.index === undefined && !c.target.name)
      throw new Error("TARGET_INDEX_OR_NAME_REQUIRED");
  }
  if(c.target?.x!==undefined||c.target?.z!==undefined){bounded(c.target.x,0,16383,"TARGET_X");bounded(c.target.z,0,16383,"TARGET_Z");}
  if (c.preconditions !== undefined)
    validateStep({
      action: "walk",
      x: 0,
      z: 0,
      level: 0,
      expect: [{ type: "hp_gain", amount: 1 }],
      preconditions: c.preconditions,
    });
  bounded(c.cooldownTicks ?? 1, 1, 100, "COOLDOWN");
  bounded(c.timeoutMs ?? 15000, 100, 60000, "TIMEOUT");
  if (c.preconditions !== undefined && !Array.isArray(c.preconditions))
    throw new Error("INVALID_PRECONDITIONS");
  return copy(c);
}
export function expected(e, b, a) {
  if (e.type === "prayer")
    return a.prayers?.activePrayers?.[e.index] === e.active;
  if (e.type === "combat_target")
    return (
      a.player?.combat?.inCombat &&
      a.player.combat.targetType === e.kind &&
      a.player.combat.targetIndex === e.index
    );
  if (e.type === "combat_style") return a.combatStyle?.currentStyle === e.style;
  return checkExpectation(e, b, a);
}
export function identity(config) {
  const o = new URL(config.world),
    g = new URL(config.gateway);
  const local = (u) => ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  if (
    o.username ||
    o.password ||
    o.search ||
    o.hash ||
    o.pathname !== "/" ||
    g.username ||
    g.password ||
    g.search ||
    g.hash
  )
    throw new Error("INVALID_WORLD_IDENTITY");
  if (
    !["https:", "http:"].includes(o.protocol) ||
    !["wss:", "ws:"].includes(g.protocol) ||
    o.hostname !== g.hostname
  )
    throw new Error("WORLD_GATEWAY_HOST_MISMATCH");
  if (!local(o) && (o.protocol !== "https:" || g.protocol !== "wss:"))
    throw new Error("REMOTE_TLS_REQUIRED");
  if (!config.character || !/^[a-zA-Z0-9 _-]{1,12}$/.test(config.character))
    throw new Error("INVALID_CHARACTER");
  return { world: o.origin, gateway: g.href, character: config.character };
}
export function classify(error) {
  const m = String(error?.message ?? error);
  if (m.startsWith("ACCESS_UNKNOWN")) return "ACCESS_UNKNOWN";
  if (m.startsWith("PROTOCOL")) return "PROTOCOL";
  if (/policy|denied|blocked/i.test(m)) return "NETWORK_POLICY";
  if (/401|403|auth|password/i.test(m)) return "AUTH";
  if (/ownership|controller|preempt/i.test(m)) return "OWNERSHIP";
  if (/fetch|network|connect|timeout|transport/i.test(m)) return "NETWORK";
  return "EXECUTION";
}
