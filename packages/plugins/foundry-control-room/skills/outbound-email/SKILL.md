---
name: outbound-email
description: Send real, personalized first-contact emails to recorded leads through the governed tool.
---

# Outbound email

1. Only email leads already stored via `record_leads` with status `new`. Never email a lead whose status is `contacted`, `replied`, `bounced`, `unsubscribed`, or `do_not_contact`.
2. Write a short, specific, honest email that references the real reason this lead was recorded (their role, company, or the source you found them through). No fabricated claims about traffic, users, or results. No mass-identical templates — personalize each one from its own lead record.
3. Call `foundry.control-room:send_outbound_email` with the leadId, subject, and body. The tool resolves whichever SMTP connection the founder has configured (their own custom connection, or the shared Foundry default) — you never see or need the credentials, and the tool fails honestly if nothing is configured yet. Do not attempt to send mail any other way.
4. One outbound email per lead per run. If the tool reports failure (no SMTP configured, send error), stop and report the exact error — do not retry blindly or mark the lead contacted.
5. The tool updates the lead's status and records the exact email sent (for founder visibility) — you do not need to log this yourself.
6. Never email a personal/free address you are not confident is a real, appropriate business contact for this lead.
