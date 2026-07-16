---
name: blog-publishing
description: Build and operate a real file-backed blog using the governed publish tool.
---

# Blog publishing

During initial product construction, implement one small content contract:

- Markdown articles live at `content/blog/<slug>.md`.
- Frontmatter fields are `title`, `slug`, `excerpt`, `publishedAt`, and `author`.
- `/blog` lists articles newest-first and `/blog/<slug>` renders accessible metadata and content.
- Build fails on invalid frontmatter or duplicate slugs.

Customize the blog layout to the product's own visual system. Do not paste a generic template.

After the contract exists, all routine publication must call `foundry.control-room:publish_blog` with original, evidence-based content. The tool writes, commits, pushes, and reports deployment state. Never manually claim a post is live; close work only with the returned file path, commit SHA, and real deployment evidence.

