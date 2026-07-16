---
name: payments
description: Add payments using governed Foundry Stripe tools without exposing Stripe credentials.
---

# Payments

1. Never read or paste a Stripe key. Use `foundry.control-room:create_stripe_payment_link` for an approved product and `foundry.control-room:provision_app_environment` for `STRIPE_SECRET_KEY` when server-side Stripe code is required.
2. Treat product creation, prices, live links, refunds, and captures as real external mutations. Verify the issue authorizes the exact product, price, currency, and mode before calling a write tool.
3. Persist Stripe customer/subscription ids against the authenticated user. Verify webhook signatures and make handlers idempotent.
4. The UI must derive entitlement from verified server/database state, never from a success-page query parameter.
5. Report actual Stripe object ids and links returned by tools; never invent checkout state or revenue.

