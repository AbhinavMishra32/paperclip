---
name: qa-recovery
description: Verify outcomes and use Paperclip's bounded recovery mechanisms without endless loops.
---

# QA and recovery

Define acceptance evidence before testing. For web products, verify production health, signup/login/logout, authorization boundaries, the primary product workflow, database persistence after reload, error states, and mobile layout.

Use Paperclip issues, blockers, watchdogs, run-liveness state, and bounded retries. Retry only transient failures with new evidence. Repeated deterministic failures require a focused bug issue containing the command/request, exact error, owner, and next action. Never loop deployments, create replacement projects, mark vague progress as done, or suppress a failing check.

