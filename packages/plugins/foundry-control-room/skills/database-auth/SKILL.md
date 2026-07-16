---
name: database-auth
description: Implement company applications with a real database and secure email/password authentication.
---

# Database and authentication

1. Commit a deterministic `db:migrate` package script and all schema migrations before provisioning production storage.
2. Call `foundry.control-room:provision_database` once. It creates Vercel-reachable Neon Postgres, connects it to the existing Vercel project, and runs the committed migration without revealing `DATABASE_URL`. Never reuse Paperclip's control-plane database and never overwrite the Marketplace-managed `DATABASE_URL` afterward.
3. Call `foundry.control-room:provision_app_environment` for `AUTH_SECRET` only. Use it for `DATABASE_URL` only when the operator explicitly configured an already serverless/reachable external database instead of the governed Neon path.
4. Email/password only unless the product brief explicitly requests another method. Normalize email, enforce uniqueness, hash passwords with Argon2id or bcrypt, and never store plaintext credentials.
5. Use opaque, revocable database-backed sessions or a mature auth library configured for database sessions. Cookies must be `HttpOnly`, `Secure` in production, `SameSite=Lax` or stricter, and have explicit expiry.
6. Rate-limit signup/login, use generic login errors, validate server-side, and protect every product/API route. A client-side redirect alone is not authorization.
7. Every customer-data query must include the authenticated user id. Add tests proving one user cannot read another user's records.
8. Run migrations and a real signup/login/logout/session test before declaring auth complete.
