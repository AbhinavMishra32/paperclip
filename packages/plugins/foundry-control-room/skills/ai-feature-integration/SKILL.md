---
name: ai-feature-integration
description: Build real application AI features using the company OpenRouter connection and the required Laguna model.
---

# AI feature integration

Use this whenever the product includes generation, chat, analysis, classification, or other model-backed behavior.

1. Call `foundry.control-room:check_openrouter_connection` before implementation. Stop with a concrete blocker if it fails.
2. The application model is exactly `poolside/laguna-xs-2.1:free` through OpenRouter. The coding-agent model is unrelated and must not be placed in product code.
3. Obtain the credential only through `foundry.control-room:provision_app_environment` with `OPENROUTER_API_KEY`. Never print, return, commit, or copy the key into source.
4. All model calls run server-side. Validate input, cap message/history size, set timeouts, handle upstream errors, and never expose provider responses containing internals.
5. For chat, store user messages and assistant messages in the application database, scope every query to the authenticated user, and reload history from the database.
6. Prove the feature using an authenticated end-to-end request and report the real response/error. A mocked response does not count.

