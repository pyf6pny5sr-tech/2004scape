import { resourceAction } from "./resource-actions";
import { copy } from "./protocol.mjs";
import { BotActions } from "../../sdk/actions";
import {
  executionContext,
  abortable,
  withExecutionDeadline,
} from "../../sdk/execution-context";
import { WartimeController } from "../controller.mjs";

export class SDKAdapter {
  metrics: any;
  constructor(public sdk: any) {}
  state() {
    return this.sdk.getState();
  }
  age() {
    return this.sdk.getStateAge();
  }
  receivedAt() {
    return this.sdk.getStateReceivedAt();
  }
  connected() {
    return this.sdk.isConnected();
  }
  controlled() {
    return this.sdk.getConnectionMode() === "control";
  }
  bound(id: any) {
    return (
      new URL(this.sdk.config.gatewayUrl).href === id.gateway &&
      this.sdk.config.botUsername.toLowerCase() === id.character.toLowerCase()
    );
  }
  subscribe(fn: any) {
    return this.sdk.onStateUpdate(fn);
  }
  onConnection(fn: any) {
    const ws = this.sdk.ws;
    const message = (event: any) => {
      try {
        const m = JSON.parse(String(event.data));
        if (m.type === "sdk_error") {
          if (String(m.error).includes("another controller connected"))
            fn("preempted");
          else if (
            /authentication|unauthorized|password/i.test(String(m.error))
          )
            fn("auth_failed");
        }
      } catch {}
    };
    ws?.addEventListener?.("message", message);
    const off = this.sdk.onConnectionStateChange(fn);
    return () => {
      off();
      ws?.removeEventListener?.("message", message);
    };
  }
  async verify(predicate: any, timeout: number, signal: AbortSignal) {
    return executionContext.run({ signal }, async () => {
      const state = this.state();
      if (predicate(state)) return copy(state);
      return copy(await this.sdk.waitForCondition(predicate, timeout));
    });
  }
  async execute(c: any, state: any, signal: AbortSignal, valid: () => boolean) {
    const base = this.sdk,
      metrics = this.metrics;
    const guarded = new Proxy(base, {
      get(target, key, receiver) {
        const value = Reflect.get(target, key, receiver);
        if (typeof value !== "function") return value;
        return (...args: any[]) => {
          if (
            typeof key === "string" &&
            (key.startsWith("send") || key === "clickDialogByText")
          ) {
            if (signal.aborted || !valid())
              throw new Error("STALE_DISPATCH_GENERATION");
          }
          const start = performance.now();
          const result = value.apply(receiver, args);
          if (key === "send" && args[0]?.type === "sdk_action")
            metrics?.count("packetDispatches:" + args[0].action?.type);
          if (key === "sendAction" && result?.then)
            return result.then((r: any) => {
              metrics?.add("dispatchAckMs", performance.now() - start);
              return r;
            });
          return result;
        };
      },
    });
    const bot = new BotActions(guarded);
    const work = async () => {
      if (!valid()) throw new Error("INVALID_OWNER");
      if (c.action === "attack_player" || c.action === "attack_npc") {
        const kind = c.action === "attack_player" ? "player" : "npc";
        const target = (
          kind === "player" ? state.nearbyPlayers : state.nearbyNpcs
        )
          ?.filter(
            (t: any) =>
              t.reachable !== false &&
              (c.target.index === undefined || t.index === c.target.index) &&
              (c.target.id === undefined || t.id === c.target.id) &&
              (c.target.name === undefined ||
                t.name.toLowerCase() === c.target.name.toLowerCase()),
          )
          .sort((a: any, b: any) => a.distance - b.distance)[0];
        if (!target || target.kind !== kind)
          throw new Error("FRESH_TYPED_TARGET_NOT_FOUND");
        return bot.attack(target);
      }
      if (c.action === "prayer_on") return bot.activatePrayer(c.index);
      if (c.action === "prayer_off") return bot.deactivatePrayer(c.index);
      if (c.action === "combat_style")
        return guarded.sendSetCombatStyle(c.style);
      if (c.action === "escape" && c.level !== state.player.level)
        throw new Error("ESCAPE_PLANE_MISMATCH");
      if (c.action === "escape")
        return bot.walkTo(c.x, c.z, 0, { timeout: 15000 });
      if(['chop','burn_logs'].includes(c.action)||(c.action==='walk'&&c.resourceFireMove===true))return resourceAction(guarded,bot,c,valid);
      // Reuse v1's reviewed exact item/loc resolution and SDK call signatures only.
      return WartimeController.prototype.dispatch.call(
        { bot, sdk: guarded, resolve: WartimeController.prototype.resolve },
        c,
        state,
      );
    };
    return executionContext.run({ signal }, () =>
      withExecutionDeadline(c.timeoutMs ?? 15000, work, () => {
        throw new Error("ACTION_DEADLINE");
      }),
    );
  }
}
