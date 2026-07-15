import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";

const startedAt = new Date().toISOString();

const plugin = definePlugin({
  async setup(ctx) {
    ctx.data.register("control-room-status", async () => ({
      status: "ready" as const,
      startedAt,
      checkedAt: new Date().toISOString()
    }));
  },

  async onHealth() {
    return { status: "ok", message: "Foundry worker is running" };
  }
});

export default plugin;
runWorker(plugin, import.meta.url);
