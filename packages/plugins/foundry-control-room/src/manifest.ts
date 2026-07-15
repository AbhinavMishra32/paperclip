import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

const manifest: PaperclipPluginManifestV1 = {
  id: "foundry.control-room",
  apiVersion: 1,
  version: "0.1.0",
  displayName: "Foundry",
  description: "Founder-facing company control room.",
  author: "Abhinav Mishra",
  categories: ["ui"],
  capabilities: ["ui.page.register"],
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui"
  },
  ui: {
    slots: [
      {
        type: "page",
        id: "control-room",
        displayName: "Foundry",
        exportName: "ControlRoomPage",
        routePath: "foundry"
      }
    ]
  }
};

export default manifest;
