import esbuild from "esbuild";
import { createPluginBundlerPresets } from "@paperclipai/plugin-sdk/bundlers";

const presets = createPluginBundlerPresets({ uiEntry: "src/ui/index.tsx" });
const watch = process.argv.includes("--watch");

// nodemailer's CJS internals (`require("events")`, etc.) break when esbuild
// inlines them into the ESM worker bundle ("Dynamic require... is not
// supported"). Keep it external and let Node resolve it normally at runtime.
const workerPreset = {
  ...presets.esbuild.worker,
  external: [...(presets.esbuild.worker.external ?? []), "nodemailer"],
};

const workerContext = await esbuild.context(workerPreset);
const manifestContext = await esbuild.context(presets.esbuild.manifest);
const uiContext = await esbuild.context(presets.esbuild.ui);

if (watch) {
  await Promise.all([workerContext.watch(), manifestContext.watch(), uiContext.watch()]);
  console.log("Foundry Control Room plugin is watching for changes");
} else {
  await Promise.all([workerContext.rebuild(), manifestContext.rebuild(), uiContext.rebuild()]);
  await Promise.all([workerContext.dispose(), manifestContext.dispose(), uiContext.dispose()]);
}
