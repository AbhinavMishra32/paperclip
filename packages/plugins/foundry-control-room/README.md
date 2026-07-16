# Foundry Control Room

Foundry is the founder-facing product layer for Paperclip companies. It uses Paperclip's native plugin UI, managed resources, company skills, routines, authorization grants, MCP gateway, activity log, agents, projects, and workspaces.

Version 0.5 composes with Paperclip's bundled Core Exec Team rather than copying it. The `setup-company` action reconciles the Growth Operator, operations project, evidence/blog routines, seven product-company skills, and role-scoped `tools:use` grants. Plugin tools are namespaced and executed through Paperclip's governed tool gateway.

Company-specific website and Vercel identifiers live in the plugin database namespace. Credentials remain Paperclip secret references; raw values are never stored in Foundry tables or returned to agents.

The founder-facing Paperclip company surface.

This plugin intentionally exposes no invented business metrics or integration
states. Each future dashboard section must be introduced together with its
real, company-scoped backend contract and verification tests.

Current route after installation: `/:companyPrefix/foundry`.
