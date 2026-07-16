# Foundry product-home plan

## Goal

Make Foundry the default, founder-facing company experience while retaining
Paperclip as the authenticated system of record and advanced workspace.

## Architecture

1. Keep Foundry as a Paperclip plugin and use Paperclip's existing auth,
   memberships, company isolation, plugin bridge, secrets, tool gateway,
   agent runs, and audit trail.
2. Add a small upstream-friendly host extension for a company default-home
   plugin. When configured, company entry opens Foundry instead of the stock
   dashboard.
3. Give Foundry its own native product shell and navigation. Link to the
   unmodified Paperclip dashboard as **Advanced workspace**.
4. Do not create a separate frontend that bypasses Paperclip APIs or copies
   Paperclip data into another database.

## Foundry behavior requirements

- All displayed operating data must come from Paperclip or an explicitly
  configured integration; never invent metrics or agent state.
- Founder-to-CEO chat is a persistent, company-scoped transcript. Founder
  messages start a real CEO run; the UI displays real pending, completed, or
  failed state and the persisted run summary.
- One Foundry tool server can serve many companies. Paperclip scopes every
  tool call to the authenticated company, agent, and run.
- Company templates remain required. They define the company mission, agents,
  provider/runtime configuration, workspaces, routines, prompts, tool grants,
  and initial goals. MCP tools supply capabilities, not company strategy.
- Move reusable, credential-bearing external operations from template scripts
  into Foundry tools. Keep repository-local build and test commands in the
  workspace instructions.

## Verification gate for every new company

1. Confirm its workspace, agents, provider, and tool grants were created.
2. Start real runs and inspect persisted output, run events, and tool audit.
3. Mark a tool connected only if a real run proves availability/use; a saved
   setting or registered tool alone is insufficient.
4. Confirm Foundry renders those same real states without loading flicker.
