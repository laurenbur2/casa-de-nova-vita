# Website backend Worker

A tiny Cloudflare Worker that backs the site. It exists because static GitHub
Pages can't safely hold API secrets — they live here instead. Two routes:

- `POST /donate` → creates a **Stripe Checkout Session** and returns its URL, so
  the donate page can charge the exact amount (base, fee-covered, or custom).
- `POST /` → relays a **contact/apply** form submission via
  [Resend](https://resend.com).

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
2. Set the secrets (not in the file):
   ```bash
   npx wrangler secret put STRIPE_SECRET_KEY   # sk_test_... (sandbox) for now
   npx wrangler secret put RESEND_API_KEY      # re_... (add when forms are ready)
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

**Donations** (`POST /donate`, JSON):
- `amount`: dollars, before fee (e.g. `50`)
- `coverFee`: `true`/`false` — adds `FEE_RATE` (3%) to cover processing
- `frequency`: `"once"` or `"monthly"`
- `returnTo`: the donate page URL to come back to (validated against `ALLOWED_ORIGINS`)

Returns `{ ok, url }`; the page redirects the donor to `url`.

**Forms** (`POST /`, JSON) send all field values plus:
- `_formType`: `"inquiry"` or `"application"`
- `_subject`: email subject line
- `_gotcha`: hidden honeypot (bots fill it → silently dropped)
