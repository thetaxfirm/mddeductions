# Blog for mddeductions.com (static site + functions)

A file-backed blog that fits your current setup: a no-framework static site
with `/api/*` serverless functions on Vercel. A small Node script renders your
Markdown posts to static HTML **during the Vercel build** and writes them into
your site's web root. No database, no CMS, no hardcoded list. New posts arrive
via `git push` and appear on the next deploy.

It is **non-destructive**: it only ever adds files under `/blog/`. Your existing
pages, `api/lead.js`, and `vercel.json` (CSP/headers) are not touched. Verified
locally — existing `index.html` and `api/lead.js` come through byte-for-byte
unchanged, and clean `/blog/<slug>` URLs render with full SEO/OG tags.

---

## 1. Add these files to the repo

Extract `blog-static-files.zip` at the repo root:

```
scripts/build-blog.mjs                       ← the generator
package.json                                  ← build script + 2 deps (merge if you have one)
content/blog/welcome-to-the-blog.md           ← sample post (delete anytime)
public/blog/welcome-to-the-blog/cover.webp    ← sample cover (delete anytime)
```

> **If your site is served from the repo root (no `public/` folder):** put the
> sample cover at `blog/welcome-to-the-blog/cover.webp` instead. The generator
> auto-detects this — it writes to `public/blog/` when a `public/` folder
> exists, otherwise to `blog/` at the root, matching how Vercel picks your web
> root. You don't configure anything; just keep images in the same web root.

**Already have a `package.json`?** Don't overwrite it — just add the two
dependencies and the build script:

```json
"scripts": { "build": "node scripts/build-blog.mjs" },
"dependencies": { "gray-matter": "^4.0.3", "marked": "^12.0.0" }
```

(The script is `.mjs`, so this does **not** require `"type": "module"` and
won't affect your existing CommonJS function in `api/lead.js`.)

## 2. Turn on the build (browser only — no terminal, no vercel.json edit)

In the Vercel dashboard → **mddeductions** project → **Settings → Build &
Development Settings**:

- **Build Command** → toggle **Override** on → enter `npm run build`
- **Output Directory** → leave it on the default (don't override). The default
  already resolves to `public/` or the root — the same place the generator
  writes to.
- **Install Command** → leave default.

Save, then redeploy (Deployments → top deployment → ⋯ → Redeploy), or just push.

That's it. Visit `/blog`.

> A failed build can't take the site down — Vercel keeps the last successful
> deployment live until a new build succeeds.

---

## How your external tool publishes a post

For each post, write **two things** and push:

1. `content/blog/<slug>.md` (or `.mdx`) — frontmatter + Markdown body
2. the cover image in the web root under `blog/<slug>/` (i.e.
   `public/blog/<slug>/cover.webp`, or `blog/<slug>/cover.webp` if you serve
   from the root)

Frontmatter contract (exact field names):

```yaml
---
title: string         # post title
description: string   # meta description / excerpt
date: string          # ISO 8601, e.g. 2026-06-22T00:00:00.000Z
slug: string          # url slug, matches the filename
image: string         # cover path, e.g. /blog/<slug>/cover.webp
tags: ["seo", "marketing"]
---
```

The filename (`<slug>.md`) sets the URL `/blog/<slug>`, so keep the filename and
the `slug` field in sync.

---

## Good to know

- **Markdown body.** Posts render as GitHub-flavored Markdown (headings, lists,
  tables, code, blockquotes, images, links). Raw HTML in a post passes through.
  True MDX (JSX/React components inside a post) needs a framework and isn't
  supported on a static site — but standard Markdown covers blog content. `.md`
  and `.mdx` files are both read.
- **Fonts + your CSP.** The pages load Fraunces/Archivo from Google Fonts to
  match your site. If your `vercel.json` CSP restricts `style-src`/`font-src`,
  either allow `fonts.googleapis.com` and `fonts.gstatic.com`, or self-host the
  fonts. If neither, the pages fall back to system serif/sans — still clean,
  just not the brand faces.
- **Replacing Soro.** If the old Soro embed served a page at `/blog`, remove
  that route so these generated pages take over. Your CSP stays as-is — this
  generator adds nothing to `vercel.json`.
- **Domain for OG/canonical** defaults to `https://mddeductions.com`. To change
  it, set a `SITE_URL` env var in Vercel.
- **Styling** lives in `scripts/build-blog.mjs` (the `STYLES` block, emitted to
  `/blog/blog.css`). The accent color is the `--accent` variable.
