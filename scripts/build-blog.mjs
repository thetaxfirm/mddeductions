// Build-time blog generator for a static (no-framework) Vercel site.
//
// Reads Markdown/MDX posts from content/blog/, renders each to static HTML,
// and writes /blog (index) and /blog/<slug>/ (one per post) into the site's
// web root. No database, no CMS, no hardcoded list — the folder is the source
// of truth. Only adds files under <webroot>/blog/; never touches anything else.
//
// Run by Vercel during the build (see README). Locally: `npm run build`.

import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { marked } from 'marked';

const ROOT = process.cwd();
const CONTENT_DIR = path.join(ROOT, 'content', 'blog');

// Vercel serves `public/` if it exists, otherwise the repo root. Match that so
// generated pages land where they'll actually be served from.
const WEB_ROOT = fs.existsSync(path.join(ROOT, 'public'))
  ? path.join(ROOT, 'public')
  : ROOT;
const OUT_DIR = path.join(WEB_ROOT, 'blog');

// Used to make OG/canonical URLs absolute. Override with the SITE_URL env var.
const SITE_URL = (process.env.SITE_URL || 'https://mddeductions.com').replace(/\/$/, '');

marked.setOptions({ gfm: true, breaks: false });

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

function head({ title, description, url, image, type }) {
  const abs = image ? (image.startsWith('http') ? image : SITE_URL + image) : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="${type}">
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
</head>`;
}

const chrome = {
  header: `<header class="site"><a class="brand" href="/">mddeductions</a><a class="navlink" href="/blog">Blog</a></header>`,
  footer: `<footer class="foot"><span>&copy; ${new Date().getFullYear()} mddeductions.com</span><a href="/">Back to site &rarr;</a></footer>`,
};

function renderIndex(posts) {
  const cards = posts
    .map(
      (p) => `<li class="card"><a class="card-link" href="/blog/${esc(p.slug)}">
  <div class="cover-frame">${p.image ? `<img class="cover" src="${esc(p.image)}" alt="" loading="lazy">` : ''}</div>
  <div class="card-body">
    <time class="date" datetime="${esc(isoDate(p.date))}">${esc(formatDate(p.date))}</time>
    <h2 class="card-title">${esc(p.title)}</h2>
    <p class="card-desc">${esc(p.description)}</p>
  </div>
</a></li>`
    )
    .join('\n');

  return `${head({
    title: 'Blog — mddeductions.com',
    description: 'Articles and updates from mddeductions.com.',
    url: `${SITE_URL}/blog`,
    image: '',
    type: 'website',
  })}
<body>
${chrome.header}
<main class="page">
  <header class="masthead">
    <p class="eyebrow">The Blog</p>
    <h1 class="page-title">Writing &amp; updates</h1>
    <p class="lede">Notes, explainers, and announcements — newest first.</p>
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

function renderPost(post) {
  const tags = post.tags.length
    ? `<ul class="tags">${post.tags.map((t) => `<li class="tag">${esc(t)}</li>`).join('')}</ul>`
    : '';

  return `${head({
    title: `${post.title} — mddeductions.com`,
    description: post.description,
    url: `${SITE_URL}/blog/${post.slug}`,
    image: post.image,
    type: 'article',
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
        ? `<div class="hero-frame"><img class="hero" src="${esc(post.image)}" alt="${esc(post.title)}"></div>`
        : ''
    }
    <div class="prose">
${post.bodyHtml}
    </div>
  </article>
</main>
${chrome.footer}
</body>
</html>`;
}

function writeFile(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
}

function main() {
  const posts = readPosts();

  fs.mkdirSync(OUT_DIR, { recursive: true });
  writeFile(path.join(OUT_DIR, 'blog.css'), STYLES);
  writeFile(path.join(OUT_DIR, 'index.html'), renderIndex(posts));
  for (const post of posts) {
    writeFile(path.join(OUT_DIR, post.slug, 'index.html'), renderPost(post));
  }

  const rel = path.relative(ROOT, OUT_DIR) || '.';
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
.navlink{font-size:.85rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;
  color:var(--ink-faint);text-decoration:none;margin-left:auto}
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

.foot{display:flex;flex-wrap:wrap;gap:.75rem 1.5rem;justify-content:space-between;
  max-width:1140px;margin:0 auto;padding:2rem clamp(1.25rem,5vw,2.5rem);
  border-top:1px solid var(--line);font-size:.85rem;color:var(--ink-faint)}
.foot a{color:var(--accent);text-decoration:none}
.foot a:hover{text-decoration:underline}

@media (prefers-reduced-motion:reduce){.cover{transition:none}}
`;

main();
