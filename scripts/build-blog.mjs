// Build-time blog generator for a static (no-framework) Vercel site.
//
// Reads Markdown/MDX posts from content/blog/, renders each to static HTML,
// and writes /blog (index) and /blog/<slug>/ (one per post).
//
// IMPORTANT — web root handling:
// Vercel serves `public/` if that folder exists, otherwise the repo root.
// Because this project keeps its site files at the repo ROOT but the blog's
// cover images live under `public/`, the presence of `public/` makes Vercel
// serve `public/` only — which would hide the root homepage. To prevent that,
// when `public/` is the web root this script first copies the existing root
// site (everything except source, config, deps, and `api/`) into `public/`,
// then generates the blog alongside it. Net effect: `public/` becomes the
// full served site (homepage + assets + blog), node_modules and sources stay
// out of it, and no vercel.json / output-directory change is needed.
//
// No database, no CMS, no hardcoded list — content/blog is the source of truth.
// Run by Vercel during the build (see README). Locally: `npm run build`.

import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { marked } from 'marked';

const ROOT = process.cwd();
const CONTENT_DIR = path.join(ROOT, 'content', 'blog');
const PUBLIC_DIR = path.join(ROOT, 'public');

// Vercel serves `public/` if it exists, otherwise the repo root. Match that so
// generated pages land where they'll actually be served from.
const WEB_ROOT = fs.existsSync(PUBLIC_DIR) ? PUBLIC_DIR : ROOT;
const OUT_DIR = path.join(WEB_ROOT, 'blog');

// Root entries that must NOT be copied into public/ (build sources, config,
// dependencies, VCS, and `api/` — Vercel serves functions from the repo root
// regardless of the output directory, so it must stay there, not be duplicated
// as a static file). Everything else at the root is treated as site content.
const DO_NOT_COPY = new Set([
  'public',
  'node_modules',
  'api',
  'content',
  'scripts',
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'vercel.json',
  'README.md',
  'README-blog.md',
  'build-blog.mjs',
  '.git',
  '.github',
  '.vercel',
  '.gitignore',
  '.vercelignore',
  '.DS_Store',
]);

// Used to make OG/canonical URLs absolute. Override with the SITE_URL env var.
const SITE_URL = (process.env.SITE_URL || 'https://mddeductions.com').replace(/\/$/, '');

const SITE_NAME = 'MD Deductions';
const HOME_MARKER = '<!--BLOG_LINKS-->';
// Set when the homepage copy meaningfully changes; drives its sitemap lastmod.
const HOME_LASTMOD = '2026-11-14';
const ORG = {
  '@type': 'Organization',
  '@id': `${SITE_URL}/#organization`,
  name: 'MH Services LLC',
  alternateName: ['MD Deductions', 'Medical Device Tax Deductions'],
  url: `${SITE_URL}/`,
};

marked.setOptions({ gfm: true, breaks: false });

// Serialize structured data safely for an inline <script> block.
function ldScript(data) {
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
}

function absUrl(p) {
  return p ? (p.startsWith('http') ? p : SITE_URL + p) : '';
}

function esc(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

// Always emit a valid ISO 8601 string for <time datetime="...">, whether the
// frontmatter date was quoted (string) or unquoted (parsed to a Date by YAML).
function isoDate(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}

// Repair internal links that point at our own domain without a scheme or
// leading slash (e.g. "mddeductions.com/blog/x"), which browsers treat as
// broken relative paths. Rewrites them to root-relative ("/blog/x"). External
// links (irs.gov, etc.) and already-correct links are left untouched.
function fixLinks(html) {
  return html.replace(
    /href="(?:https?:\/\/)?(?:www\.)?mddeductions\.com(\/[^"]*)?"/gi,
    (_match, p) => `href="${p || '/'}"`
  );
}

function readPosts() {
  if (!fs.existsSync(CONTENT_DIR)) return [];
  return fs
    .readdirSync(CONTENT_DIR)
    .filter((file) => file.endsWith('.md') || file.endsWith('.mdx'))
    .map((file) => {
      const fileSlug = file.replace(/\.mdx?$/, '');
      const raw = fs.readFileSync(path.join(CONTENT_DIR, file), 'utf8');
      const { data, content } = matter(raw);
      return {
        slug: fileSlug, // URL + folder name come from the filename
        title: data.title || '',
        description: data.description || '',
        date: data.date || '',
        image: data.image || '',
        tags: Array.isArray(data.tags) ? data.tags : [],
        bodyHtml: fixLinks(marked.parse(content)),
      };
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

function head({ title, description, url, image, type, jsonLd = [], published = '' }) {
  const abs = image ? (image.startsWith('http') ? image : SITE_URL + image) : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(url)}">
<meta name="robots" content="index,follow,max-image-preview:large">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<meta property="og:site_name" content="${esc(SITE_NAME)}">
<meta property="og:type" content="${type}">
${published ? `<meta property="article:published_time" content="${esc(published)}">` : ''}
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url)}">
${abs ? `<meta property="og:image" content="${esc(abs)}">` : ''}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
${abs ? `<meta name="twitter:image" content="${esc(abs)}">` : ''}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600&family=Fraunces:opsz,wght@9..144,400;9..144,500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/blog/blog.css">
${jsonLd.map(ldScript).join('\n')}
</head>`;
}

const chrome = {
  header: `<header class="site"><a class="brand" href="/" aria-label="MD Deductions, medical device tax deductions home">MD Deductions</a><nav class="sitenav" aria-label="Primary"><a class="navlink" href="/blog">Articles</a><a class="navlink" href="/#calculator">Calculator</a><a class="navlink" href="/#contact">Book a call</a></nav></header>`,
  footer: `<footer class="foot"><span>&copy; ${new Date().getFullYear()} MH Services LLC &middot; mddeductions.com. General information, not tax, legal or investment advice.</span><a href="/">Medical device tax deductions &rarr;</a></footer>`,
};

function renderIndex(posts) {
  const cards = posts
    .map(
      (p) => `<li class="card"><a class="card-link" href="/blog/${esc(p.slug)}">
  <div class="cover-frame">${p.image ? `<img class="cover" src="${esc(p.image)}" alt="" loading="lazy" width="1200" height="750">` : ''}</div>
  <div class="card-body">
    <time class="date" datetime="${esc(isoDate(p.date))}">${esc(formatDate(p.date))}</time>
    <h2 class="card-title">${esc(p.title)}</h2>
    <p class="card-desc">${esc(p.description)}</p>
  </div>
</a></li>`
    )
    .join('\n');

  return `${head({
    title: 'Medical Equipment Tax Deduction Articles | MD Deductions',
    description:
      'Plain-language guides to Section 168(k) bonus depreciation, Section 179, material participation and passive loss rules for medical equipment businesses.',
    url: `${SITE_URL}/blog`,
    image: '/assets/hero.jpg',
    type: 'website',
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'Blog',
        '@id': `${SITE_URL}/blog#blog`,
        name: 'MD Deductions articles',
        url: `${SITE_URL}/blog`,
        publisher: ORG,
        blogPost: posts.map((p) => ({
          '@type': 'BlogPosting',
          headline: p.title,
          url: `${SITE_URL}/blog/${p.slug}`,
          datePublished: isoDate(p.date),
        })),
      },
      breadcrumb([['Home', `${SITE_URL}/`], ['Articles', `${SITE_URL}/blog`]]),
    ],
  })}
<body>
${chrome.header}
<main class="page">
  <header class="masthead">
    <h1 class="page-title">Medical equipment tax deduction guides</h1>
    <p class="lede">Bonus depreciation, Section 179, material participation and the loss limits that decide whether a deduction is usable. Newest first.</p>
  </header>
  ${
    posts.length === 0
      ? `<p class="empty">No posts yet. Check back soon.</p>`
      : `<ul class="grid">\n${cards}\n</ul>`
  }
</main>
${chrome.footer}
</body>
</html>`;
}

function breadcrumb(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map(([name, item], i) => ({ '@type': 'ListItem', position: i + 1, name, item })),
  };
}

// Up to three other posts, preferring ones that share a tag, so every article
// links to its neighbours instead of being a dead end.
function relatedPosts(post, posts) {
  const tags = new Set(post.tags);
  return posts
    .filter((p) => p.slug !== post.slug)
    .map((p, i) => ({ p, i, score: p.tags.filter((t) => tags.has(t)).length }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, 3)
    .map((x) => x.p);
}

function renderPost(post, posts = []) {
  const related = relatedPosts(post, posts);
  const tags = post.tags.length
    ? `<ul class="tags">${post.tags.map((t) => `<li class="tag">${esc(t)}</li>`).join('')}</ul>`
    : '';

  return `${head({
    // Keep search titles under ~60 characters: only add the brand when it fits.
    title: post.title.length <= 45 ? `${post.title} | MD Deductions` : post.title,
    description: post.description,
    url: `${SITE_URL}/blog/${post.slug}`,
    image: post.image,
    type: 'article',
    published: isoDate(post.date),
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        '@id': `${SITE_URL}/blog/${post.slug}#article`,
        mainEntityOfPage: `${SITE_URL}/blog/${post.slug}`,
        headline: post.title,
        description: post.description,
        ...(post.image ? { image: [absUrl(post.image)] } : {}),
        datePublished: isoDate(post.date),
        dateModified: isoDate(post.date),
        author: ORG,
        publisher: ORG,
        ...(post.tags.length ? { keywords: post.tags.join(', ') } : {}),
      },
      breadcrumb([
        ['Home', `${SITE_URL}/`],
        ['Articles', `${SITE_URL}/blog`],
        [post.title, `${SITE_URL}/blog/${post.slug}`],
      ]),
    ],
  })}
<body>
${chrome.header}
<main class="page">
  <article class="article">
    <a class="back" href="/blog">&larr; All posts</a>
    <header class="post-header">
      <div class="meta">
        <time class="date" datetime="${esc(isoDate(post.date))}">${esc(formatDate(post.date))}</time>
        ${tags}
      </div>
      <h1 class="title">${esc(post.title)}</h1>
      ${post.description ? `<p class="post-lede">${esc(post.description)}</p>` : ''}
    </header>
    ${
      post.image
        ? `<div class="hero-frame"><img class="hero" src="${esc(post.image)}" alt="${esc(post.title)}" width="1600" height="900" fetchpriority="high"></div>`
        : ''
    }
    <div class="prose">
${post.bodyHtml}
    </div>
    <aside class="next" aria-label="Next steps">
      <p class="next-h">Run your own numbers</p>
      <p>Model clinic revenue and the first-year deduction with the <a href="/#calculator">medical equipment depreciation calculator</a>, or <a href="/#contact">book a strategy session</a> to see whether it fits your facts.</p>
    </aside>
    ${
      related.length
        ? `<nav class="related" aria-label="Related articles"><p class="next-h">Related articles</p><ul>${related
            .map((r) => `<li><a href="/blog/${esc(r.slug)}">${esc(r.title)}</a></li>`)
            .join('')}</ul></nav>`
        : ''
    }
  </article>
</main>
${chrome.footer}
</body>
</html>`;
}

function day(value) {
  return isoDate(value).slice(0, 10);
}

// Full sitemap: homepage, article index and every article, regenerated on each
// build so newly published posts are discoverable without a manual edit.
function renderSitemap(posts) {
  const newest = posts.length ? day(posts[0].date) : '';
  const homeMod = day(fs.statSync(path.join(ROOT, 'index.html')).mtime);
  const latest = [newest, HOME_LASTMOD || homeMod].filter(Boolean).sort().pop();
  const urls = [
    { loc: `${SITE_URL}/`, lastmod: HOME_LASTMOD || latest },
    { loc: `${SITE_URL}/blog`, lastmod: newest || latest },
    ...posts.map((p) => ({ loc: `${SITE_URL}/blog/${p.slug}`, lastmod: day(p.date) })),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map((u) => `  <url>\n    <loc>${esc(u.loc)}</loc>${u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : ''}\n  </url>`)
  .join('\n')}
</urlset>
`;
}

// llms.txt: a plain index of the site for AI assistants and answer engines.
function renderLlms(posts) {
  return `# MD Deductions (mddeductions.com)

> Medical Device Tax Deductions, offered through MH Services LLC. The site explains how entrepreneurs and high W-2 earners can use first-year bonus depreciation under IRC Section 168(k) by building out operating clinics with medical equipment, and the rules (material participation, at-risk, excess business loss, recapture) that decide whether the deduction is usable. General information only, not tax, legal or investment advice.

## Main pages

- [Medical device tax deductions](${SITE_URL}/): overview, clinic revenue and tax savings calculators, the rules, FAQ, disclosures
- [Articles](${SITE_URL}/blog): guides to depreciation and loss-limit rules for medical equipment businesses

## Articles

${posts.map((p) => `- [${p.title}](${SITE_URL}/blog/${p.slug}): ${p.description}`).join('\n')}

## Contact

- MH Services LLC, chris@mhservicesllc.com, (702) 498-2144
`;
}

// The homepage's journal section is filled in by a third-party script, so the
// HTML itself carried no links to the articles. Replace the marker in the
// served homepage with a plain, crawlable list of every article.
function injectHomeLinks(posts) {
  const file = path.join(WEB_ROOT, 'index.html');
  if (!fs.existsSync(file)) return;
  const html = fs.readFileSync(file, 'utf8');
  if (!html.includes(HOME_MARKER)) return;
  const list = posts.length
    ? `<div class="all"><p class="all-h">All articles</p><ol>${posts
        .map((p) => `<li><a href="/blog/${esc(p.slug)}">${esc(p.title)}</a></li>`)
        .join('')}</ol><p class="all-more"><a href="/blog">Browse the article index</a></p></div>`
    : '';
  // Only rewrite the copy in public/; never modify the root source file.
  if (WEB_ROOT === PUBLIC_DIR) fs.writeFileSync(file, html.replace(HOME_MARKER, list));
}

function writeFile(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
}

// When public/ is the web root, mirror the root site files into it so the
// homepage and assets are served from the same directory as the blog. Skips
// build sources, config, deps, VCS, and api/. No-op when serving from root.
function copySiteIntoPublic() {
  if (WEB_ROOT !== PUBLIC_DIR) return 0;
  let copied = 0;
  for (const entry of fs.readdirSync(ROOT)) {
    if (DO_NOT_COPY.has(entry)) continue;
    // Never copy hidden/dotfiles into the web root (.env, .DS_Store, etc.),
    // except legitimate public paths like .well-known.
    if (entry.startsWith('.') && entry !== '.well-known') continue;
    fs.cpSync(path.join(ROOT, entry), path.join(PUBLIC_DIR, entry), {
      recursive: true,
      force: true,
    });
    copied += 1;
  }
  return copied;
}

function main() {
  const copied = copySiteIntoPublic();

  const posts = readPosts();

  fs.mkdirSync(OUT_DIR, { recursive: true });
  writeFile(path.join(OUT_DIR, 'blog.css'), STYLES);
  writeFile(path.join(OUT_DIR, 'index.html'), renderIndex(posts));
  for (const post of posts) {
    writeFile(path.join(OUT_DIR, post.slug, 'index.html'), renderPost(post, posts));
  }

  writeFile(path.join(WEB_ROOT, 'sitemap.xml'), renderSitemap(posts));
  writeFile(path.join(WEB_ROOT, 'llms.txt'), renderLlms(posts));
  injectHomeLinks(posts);

  const rel = path.relative(ROOT, OUT_DIR) || '.';
  if (copied > 0) {
    console.log(`blog: mirrored ${copied} root item(s) into public/`);
  }
  console.log(`blog: wrote ${posts.length} post(s) + index to ${rel}/`);
}

const STYLES = `:root{
  --ink:#16181d; --ink-soft:#41454e; --ink-faint:#8a8e97;
  --line:#e7e7ea; --accent:#0f5e4e; --accent-tint:#eaf3f0;
  --display:'Fraunces',Georgia,'Times New Roman',serif;
  --body:'Archivo',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;color:var(--ink);font-family:var(--body);background:#fff;line-height:1.5}
img{max-width:100%}
a{color:inherit}

.site{display:flex;align-items:center;gap:1.5rem;max-width:1140px;margin:0 auto;
  padding:1.25rem clamp(1.25rem,5vw,2.5rem);border-bottom:1px solid var(--line)}
.brand{font-family:var(--display);font-weight:500;font-size:1.2rem;letter-spacing:-.01em;text-decoration:none}
.sitenav{display:flex;flex-wrap:wrap;gap:.4rem 1.4rem;margin-left:auto}
.navlink{font-size:.9rem;font-weight:600;color:var(--ink-soft);text-decoration:none}
.navlink:hover{color:var(--accent)}

.page{max-width:1140px;margin:0 auto;padding:clamp(2.5rem,6vw,4.5rem) clamp(1.25rem,5vw,2.5rem) 5rem}

.masthead{max-width:40rem;margin-bottom:clamp(2.5rem,5vw,4rem)}
.eyebrow{margin:0 0 1rem;font-size:.78rem;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:var(--accent)}
.eyebrow::before{content:'';display:inline-block;width:1.75rem;height:2px;margin-right:.75rem;vertical-align:middle;background:var(--accent)}
.page-title{margin:0;font-family:var(--display);font-weight:460;font-size:clamp(2.5rem,6vw,4rem);line-height:1.04;letter-spacing:-.02em}
.lede{margin:1.25rem 0 0;max-width:34rem;font-size:1.075rem;line-height:1.6;color:var(--ink-soft)}
.empty{color:var(--ink-soft);font-size:1.05rem}

.grid{list-style:none;margin:0;padding:0;display:grid;
  grid-template-columns:repeat(auto-fill,minmax(min(100%,21rem),1fr));gap:clamp(1.75rem,4vw,2.75rem)}
.card{margin:0}
.card-link{display:flex;flex-direction:column;height:100%;text-decoration:none;color:inherit}
.cover-frame{position:relative;aspect-ratio:16/10;overflow:hidden;border-radius:12px;background:#f1f1ee;border:1px solid var(--line)}
.cover{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:transform .5s cubic-bezier(.2,.7,.2,1)}
.card-link:hover .cover{transform:scale(1.04)}
.card-body{padding:1.15rem .15rem 0}
.date{display:block;font-size:.72rem;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-faint)}
.card-title{margin:.6rem 0 0;font-family:var(--display);font-weight:460;font-size:1.45rem;line-height:1.18;letter-spacing:-.01em}
.card-link:hover .card-title{text-decoration:underline;text-decoration-color:var(--accent);text-underline-offset:3px;text-decoration-thickness:1.5px}
.card-desc{margin:.55rem 0 0;font-size:.95rem;line-height:1.55;color:var(--ink-soft);
  display:-webkit-box;-webkit-line-clamp:3;line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.card-link:focus-visible{outline:2px solid var(--accent);outline-offset:4px;border-radius:4px}

.article{max-width:44rem;margin:0 auto}
.back{display:inline-block;margin-bottom:clamp(1.75rem,4vw,2.75rem);font-size:.85rem;font-weight:600;color:var(--accent);text-decoration:none}
.back:hover{text-decoration:underline;text-underline-offset:3px}
.meta{display:flex;flex-wrap:wrap;align-items:center;gap:.65rem 1rem;margin-bottom:1.1rem}
.tags{list-style:none;display:flex;flex-wrap:wrap;gap:.4rem;margin:0;padding:0}
.tag{font-size:.72rem;font-weight:600;letter-spacing:.04em;color:var(--accent);background:var(--accent-tint);padding:.2rem .6rem;border-radius:999px}
.title{margin:0;font-family:var(--display);font-weight:460;font-size:clamp(2.1rem,5.5vw,3.3rem);line-height:1.07;letter-spacing:-.02em}
.post-lede{margin:1.1rem 0 0;font-size:1.2rem;line-height:1.55;color:var(--ink-soft)}
.hero-frame{position:relative;aspect-ratio:16/9;margin:clamp(2rem,5vw,3rem) 0;overflow:hidden;border-radius:14px;background:#f1f1ee;border:1px solid var(--line)}
.hero{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}

.prose{font-size:1.08rem;line-height:1.75;color:#23262d}
.prose>:first-child{margin-top:0}
.prose p{margin:0 0 1.35rem}
.prose h2{font-family:var(--display);font-weight:500;font-size:1.7rem;line-height:1.2;letter-spacing:-.01em;margin:2.6rem 0 1rem}
.prose h3{font-family:var(--display);font-weight:500;font-size:1.35rem;line-height:1.25;margin:2.1rem 0 .85rem}
.prose a{color:var(--accent);text-decoration:underline;text-decoration-thickness:1.5px;text-underline-offset:2px}
.prose ul,.prose ol{margin:0 0 1.35rem;padding-left:1.3rem}
.prose li{margin:.4rem 0}
.prose blockquote{margin:1.8rem 0;padding:.4rem 0 .4rem 1.3rem;border-left:3px solid var(--accent);color:var(--ink-soft);font-style:italic}
.prose img{display:block;width:100%;height:auto;margin:1.8rem 0;border-radius:12px;border:1px solid var(--line)}
.prose code{font-family:'SF Mono',ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.9em;background:#f2f2f0;padding:.15em .4em;border-radius:5px}
.prose pre{margin:1.6rem 0;padding:1.1rem 1.25rem;background:#16181d;color:#eceef2;border-radius:12px;overflow-x:auto;font-size:.92rem;line-height:1.6}
.prose pre code{background:none;padding:0;color:inherit;font-size:inherit}
.prose hr{border:none;border-top:1px solid var(--line);margin:2.5rem 0}
.prose table{width:100%;border-collapse:collapse;margin:1.6rem 0;font-size:.96rem}
.prose th,.prose td{border:1px solid var(--line);padding:.6rem .8rem;text-align:left}
.prose th{background:#f7f7f5;font-weight:600}

.next,.related{margin-top:2.75rem;padding-top:1.75rem;border-top:1px solid var(--line);font-size:1.02rem;line-height:1.65;color:var(--ink-soft)}
.next-h{margin:0 0 .6rem;font-family:var(--display);font-weight:500;font-size:1.35rem;line-height:1.25;color:var(--ink)}
.next p{margin:0}
.next a,.related a{color:var(--accent);text-decoration:underline;text-decoration-thickness:1.5px;text-underline-offset:2px}
.related ul{margin:0;padding-left:1.2rem}
.related li{margin:.45rem 0}

.foot{display:flex;flex-wrap:wrap;gap:.75rem 1.5rem;justify-content:space-between;
  max-width:1140px;margin:0 auto;padding:2rem clamp(1.25rem,5vw,2.5rem);
  border-top:1px solid var(--line);font-size:.85rem;color:var(--ink-faint)}
.foot a{color:var(--accent);text-decoration:none}
.foot a:hover{text-decoration:underline}

@media (prefers-reduced-motion:reduce){.cover{transition:none}}
`;

main();
