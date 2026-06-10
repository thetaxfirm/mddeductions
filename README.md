# MH Services — Medical Device Tax Deductions site

A single-page marketing site with interactive revenue/tax calculators and a working lead form backed by a Vercel serverless function.

## Files

```
index.html        The site (copy, calculators, styles, client JS)
api/lead.js        Serverless function — emails leads via your Google mailbox (raw SMTP, zero dependencies)
vercel.json        Security headers, caching, clean URLs
robots.txt         Crawl rules + sitemap pointer
sitemap.xml        Single-page sitemap
README.md          This file
```

## Deploy to Vercel

**Option A — drag & drop (fastest):** Vercel dashboard → **Add New → Project → Deploy** and drop this folder in. Vercel detects the static site and the `api/` function automatically; no build step.

**Option B — CLI:**

```bash
npm i -g vercel      # if you don't have it
cd this-folder
vercel               # preview deploy
vercel --prod        # production deploy
```

**Option C — Git:** push the folder to a GitHub repo and import it in Vercel for auto-deploys on every push.

There is no build command and no framework — it's static HTML plus one Node serverless function, so it deploys in seconds.

## Turn on lead delivery (Environment Variables)

The form posts to `/api/lead`, which sends the lead through your own Google Workspace mailbox over SMTP — no third-party email service. Until you add the variables below, submissions still succeed and are written to the function logs (Vercel → Deployments → **Functions** → logs) so nothing is lost.

| Variable | Example | Purpose |
|----------|---------|---------|
| `SMTP_USER` | `marketing@thetaxfirm.us` | The Google Workspace mailbox that sends the notification |
| `SMTP_PASS` | `abcd efgh ijkl mnop` (no spaces) | A Google **App Password** for that mailbox (see below) |
| `LEAD_TO_EMAIL` | `chris@thetaxfirm.us` | Where leads land (optional; defaults to `SMTP_USER`) |

**Creating the App Password (one-time):**
1. The sending mailbox (e.g. `marketing@thetaxfirm.us`) must have **2-Step Verification** turned on — myaccount.google.com → Security → 2-Step Verification.
2. Then go to **myaccount.google.com → Security → App passwords**, create one named "Website leads," and copy the 16-character value.
3. If you don't see "App passwords," your Workspace admin has disabled it — an admin can allow it under Admin console → Security → Less secure apps / App passwords.

Set the variables in **Vercel → Project → Settings → Environment Variables** (mark `SMTP_PASS` as Sensitive), then **redeploy** — env changes only take effect on a new deployment.

Because the mail is sent from and to your own Google domain, it lands in the inbox and passes SPF/DKIM/DMARC automatically — no domain verification needed.

## After deploying — quick checklist

- [ ] Create the Google App Password, set `SMTP_USER` / `SMTP_PASS` / `LEAD_TO_EMAIL`, and redeploy.
- [ ] Submit a test through the form and confirm the email arrives in the inbox.
- [ ] In Vercel, set **`mddeductions.com` as the primary domain** and make sure the other variant (`www.mddeductions.com`) redirects to it — the canonical URL, `sitemap.xml`, and `robots.txt` all point at the apex `https://mddeductions.com/`.
- [ ] Submit `sitemap.xml` in Google Search Console.
- [ ] Spot-check the page on a phone — the nav collapses to a hamburger and wide tables scroll horizontally.

## Notes

- Fonts (Fraunces + Archivo) load asynchronously and never block first paint.
- The form includes a hidden honeypot field; bot submissions are dropped silently.
- `vercel.json` sets a Content-Security-Policy scoped to the site's own origin plus Google Fonts. If you later add a third-party script (analytics, chat widget, pixel), add its domain to the `script-src` / `connect-src` directives or it will be blocked.
