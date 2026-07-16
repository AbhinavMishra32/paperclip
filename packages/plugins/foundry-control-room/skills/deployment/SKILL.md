---
name: deployment
description: Ship company applications through the governed Git and Vercel deployment path.
---

# Deployment

1. Work only inside the task's resolved project Git workspace.
2. Install dependencies once in the foreground, then run the repository's lint, typecheck, tests, and production build. Fix failures rather than hiding them.
   - Never background a package-manager process or start a second installer while the first one is active.
   - On a mounted workspace where pnpm reports `EPERM ... futime`, use npm with a run-scoped cache under `/tmp` (for example `npm_config_cache=/tmp/npm-cache-$PAPERCLIP_RUN_ID npm install`).
   - If a prior interrupted install left `node_modules` inconsistent, first ensure no installer from this run is active, remove the incomplete directory once, and retry once in the foreground. Do not loop installers.
3. Commit the complete change with no secrets and a clean working tree.
4. Call `foundry.control-room:deploy_project`. It pushes the committed HEAD and queries the configured Vercel project for the real deployment.
5. A successful push is not a successful deployment. Check the returned deployment state and production URL; inspect build/runtime logs on failure.
6. Report commit SHA, deployment id, state, and URL. Never create a second Vercel project merely because an existing deployment failed.
