---
name: deployment
description: Ship company applications through the governed Git and Vercel deployment path.
---

# Deployment

1. Work only inside the task's resolved project Git workspace.
2. Install dependencies once in the foreground, then run the repository's lint, typecheck, tests, and production build. Fix failures rather than hiding them.
   - Never background a package-manager process or start a second installer while the first one is active.
   - Keep the declared package manager and lockfile consistent. A committed package manifest whose dependencies are absent from the lockfile is a release blocker; do not rely on a non-frozen production install to conceal it.
   - On a mounted workspace where package installation or deletion reports `EPERM ... futime`, copy the tracked source to a run-scoped directory under `/tmp`, install/build there with a run-scoped cache, and copy back only intentional tracked source or lockfile changes. Do not move `node_modules` back onto the mounted workspace.
   - If a prior interrupted install left `node_modules` inconsistent, first ensure no installer from this run is active, remove the incomplete directory once, and retry once in the foreground. Do not loop installers.
3. Commit the complete change with no secrets and a clean working tree.
4. Call `foundry.control-room:deploy_project`. It pushes the committed HEAD and starts a non-interactive authenticated production deployment against the existing configured Vercel project. The tool intentionally returns without waiting for the remote build.
5. A successful push or accepted deployment is not a successful release. Poll `foundry.control-room:get_vercel_deployments` until that deployment reaches `READY` or `ERROR`; inspect build/runtime logs on failure. Do not call `deploy_project` again while the accepted deployment is still `BUILDING` or `QUEUED`.
6. Report commit SHA, deployment id, state, and URL. Never create a second Vercel project merely because an existing deployment failed.
