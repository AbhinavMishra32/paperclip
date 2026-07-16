---
name: database-auth
description: Implement company applications with a real database and secure email/password authentication.
---

# Database and authentication

1. Call `foundry.control-room:provision_app_environment` for `DATABASE_URL` and `AUTH_SECRET`. Never reuse Paperclip's control-plane database.
2. Use schema migrations committed with the application. Do not rely on ad-hoc production schema creation during requests.
3. Email/password only unless the product brief explicitly requests another method. Normalize email, enforce uniqueness, hash passwords with Argon2id or bcrypt, and never store plaintext credentials.
4. Use opaque, revocable database-backed sessions or a mature auth library configured for database sessions. Cookies must be `HttpOnly`, `Secure` in production, `SameSite=Lax` or stricter, and have explicit expiry.
5. Rate-limit signup/login, use generic login errors, validate server-side, and protect every product/API route. A client-side redirect alone is not authorization.
6. Every customer-data query must include the authenticated user id. Add tests proving one user cannot read another user's records.
7. Run migrations and a real signup/login/logout/session test before declaring auth complete.

