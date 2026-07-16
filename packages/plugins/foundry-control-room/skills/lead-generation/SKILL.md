---
name: lead-generation
description: Find real prospective customers from public sources and record them through the governed tool.
---

# Lead generation

Your job is to find real people who plausibly need this specific product, not to generate a plausible-looking list.

1. Research using whatever browsing/search access your runtime gives you. Ground every candidate in a real, publicly accessible page (a company site, a directory listing, a public profile, a job posting, a forum post) that supports the person's name, role, and relevance to the product.
2. A lead is only valid if you can supply a real `sourceUrl` you actually found it on and a real email address found or confidently derivable from that source (e.g. a published company contact pattern). Never invent, guess-format, or hallucinate an email address.
3. Call `foundry.control-room:record_leads` with the candidates. The tool deduplicates by email against existing leads for this company and rejects anything missing a source. Report only what the tool actually stored — its response is the evidence, not your own summary.
4. Quality over quantity: 3 well-justified leads beat 20 speculative ones. Skip the run entirely and say why if you cannot find real candidates.
5. Never scrape or store personal data beyond what is needed to make first contact (name, title, company, email, source, a one-line reason). No phone numbers, addresses, or other personal data.
6. Do not contact a lead yourself here — that is the separate `outbound-email` skill's job, gated on the founder's actual SMTP configuration.
