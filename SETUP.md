# Integrations setup — Stripe & Resend

The website is a static site on GitHub Pages, so it has no server of its own.
That shapes how each integration connects:

- **Stripe donations** use **Payment Links** — hosted checkout pages, no server
  needed. You create the links in Stripe; the site just links to them.
- **Forms (contact + apply)** send email through **Resend**, but Resend needs a
  secret key that can't live in a static site. A tiny **Cloudflare Worker**
  (in [`worker/`](worker/)) holds the key and relays submissions to email.

The code is done. What's left are account steps that require logging into your
own accounts — that's everything below.

---

## 1. Stripe — donation Payment Links (test first, then live)

The donate page ([`src/pages/donate.astro`](src/pages/donate.astro)) already has
a `STRIPE` object with slots for each amount. You create the links, then paste
the URLs in.

### Test mode
1. Sign in at **dashboard.stripe.com** with the account you made yesterday.
2. Turn on the **Test mode** toggle (top-right).
3. Go to **Payment Links → + New**. For each amount, create a link:
   - **One-time $20 / $50 / $100 / $500** — add a product named e.g. "Donation",
     set a **one-time** price of that amount.
   - **Monthly** versions — same, but set the price to **recurring → monthly**.
   - **Custom amount** — when adding the price, choose **"Customers choose what
     they pay"**. Make one for one-time and one for monthly.
4. After saving each link, copy its URL (test links look like
   `https://buy.stripe.com/test_...`).
5. Paste each URL into the matching slot in `donate.astro`:
   ```js
   const STRIPE = {
     once:    { "20": "...", "50": "...", "100": "...", "500": "...", custom: "..." },
     monthly: { "20": "...", "50": "...", "100": "...", "500": "...", custom: "..." },
   };
   ```
   (Any slot you leave as `STRIPE_PLACEHOLDER` just links to your Stripe
   dashboard, so nothing breaks while you fill them in.)
6. **Test a donation:** open the donate page, click through, and pay with test
   card **4242 4242 4242 4242**, any future expiry, any CVC, any ZIP.

### Getting receipts to donors + notifications to you
- **Settings → Customer emails** → turn on **"Successful payments"** so donors
  get an emailed receipt automatically.
- Your Stripe account already emails **your login address** on each payment.
  To add or change it: **Settings → Team and security** (or Notifications).

### Going live
- Turn **Test mode off** and finish **account activation** (business details +
  bank account) so Stripe can pay out.
- **Re-create the Payment Links in live mode** — test links don't work live —
  and replace the URLs in `donate.astro` with the live ones.

---

## 2. Resend — email for the forms

1. Sign up at **resend.com** with your email.
2. **Add your domain:** **Domains → Add Domain → `casadanovavida.com`**. Resend
   shows a few DNS records (SPF / DKIM / DMARC). Add them at wherever
   `casadanovavida.com`'s DNS is managed, then wait for **Verified**.
   - *Want to test before DNS verifies?* Resend lets you send from
     `onboarding@resend.dev` **to your own account email only**. Fine for a first
     smoke test; switch to your domain once it's verified.
3. **Create an API key:** **API Keys → Create API Key** (Sending access is
   enough). Copy it — it starts with `re_`. This is the secret for the Worker.

---

## 3. Cloudflare Worker — connects the forms to Resend

Full details in [`worker/README.md`](worker/README.md). Short version:

```bash
cd worker
npm install
npx wrangler login                     # authorize (or create) your Cloudflare account
```

1. Edit [`worker/wrangler.toml`](worker/wrangler.toml) `[vars]`:
   - `FROM_EMAIL` — e.g. `Casa da Nova Vida <forms@casadanovavida.com>`
     (domain must be the one you verified in Resend).
   - `TO_EMAIL` — where submissions go, e.g. `info@casadanovavida.com`.
     Comma-separate to send to more than one (e.g. add your Gmail).
   - `ALLOWED_ORIGINS` — already set to your GitHub Pages site + localhost.
2. Store the Resend key as a secret:
   ```bash
   npx wrangler secret put RESEND_API_KEY   # paste the re_... key
   ```
3. Deploy:
   ```bash
   npx wrangler deploy
   ```
   Copy the printed URL, e.g.
   `https://casadanovavida-forms.<your-subdomain>.workers.dev`.
4. Paste that URL into [`src/lib/config.ts`](src/lib/config.ts) as
   `FORMS_ENDPOINT` (replacing the `REPLACE-ME` placeholder).
5. Commit + push → GitHub Pages rebuilds.
6. **Test:** submit the contact form on the live site and confirm the email
   lands at `TO_EMAIL`.

---

## Quick status

| Piece | Code | Your account steps |
|-------|------|--------------------|
| Donate page (Payment Links) | ✅ ready | Create links, paste URLs, activate account for live |
| Contact + apply forms | ✅ ready | — |
| Cloudflare Worker | ✅ written | `wrangler login`, set vars + secret, deploy, paste URL |
| Resend | — | Verify domain, create API key |
