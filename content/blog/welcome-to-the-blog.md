---
title: Welcome to the blog
description: A quick tour of how this blog works — and where new posts come from.
date: 2026-06-22T00:00:00.000Z
slug: welcome-to-the-blog
image: /blog/welcome-to-the-blog/cover.webp
tags: ["announcements", "how-it-works"]
---

This is a starter post so you can see the layout, typography, and spacing with real content in place. Delete it whenever you're ready — nothing depends on it.

## Where posts come from

Every post is a single Markdown file in `content/blog/`. Drop a new file in that folder, push to GitHub, and it shows up here on the next build. No database, no dashboard, no hardcoded list.

The cover image lives in `public/blog/<slug>/` and is referenced from the frontmatter by absolute path — for this post, `/blog/welcome-to-the-blog/cover.webp`.

## What you can write

The body is Markdown, so the usual things work:

- **Bold** and *italic* text
- Lists, like this one
- [Links](https://example.com) to anywhere
- Inline `code` and fenced code blocks

> Pull quotes look like this — handy for emphasizing a single line.

### Frontmatter at a glance

| Field         | Example                              |
| ------------- | ------------------------------------ |
| `title`       | Welcome to the blog                  |
| `date`        | 2026-06-22T00:00:00.000Z             |
| `slug`        | welcome-to-the-blog                  |
| `image`       | /blog/welcome-to-the-blog/cover.webp |
| `tags`        | ["announcements", "how-it-works"]    |

That's the whole workflow: write the file, push, done.
