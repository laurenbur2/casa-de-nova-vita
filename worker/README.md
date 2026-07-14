# Forms Worker

A tiny Cloudflare Worker that receives the website's **contact** and **apply**
form submissions and emails them via [Resend](https://resend.com). It exists
because the site is hosted on static GitHub Pages, which cannot safely hold the
Resend API key — the key lives here as a Worker secret instead.

## One-time setup

```bash
cd worker
npm install
npx wrangler login            # opens the browser to authorize your Cloudflare account
```

## Configure

1. Edit `wrangler.toml` → `[vars]`:
   - `FROM_EMAIL` — must use a domain you've verified in Resend.
   - `TO_EMAIL` — where submissions land (comma-separated for multiple).
   - `ALLOWED_ORIGINS` — your live site origin(s) + `http://localhost:4321`.
2. Set the Resend key as a secret (not in the file):
   ```bash
   npx wrangler secret put RESEND_API_KEY
   ```

## Deploy

```bash
npx wrangler deploy
```

Wrangler prints the Worker URL, e.g.
`https://casadanovavida-forms.<your-subdomain>.workers.dev`.
Copy it into `FORMS_ENDPOINT` in `../src/lib/config.ts`.

## Local dev

```bash
cp .dev.vars.example .dev.vars   # put a Resend test key inside
npx wrangler dev
```

## How the site calls it

The forms POST `application/json` with all field values plus:
- `_formType`: `"inquiry"` or `"application"`
- `_subject`: email subject line
- `_gotcha`: hidden honeypot (bots fill it → silently dropped)
