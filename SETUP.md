# Integrations setup — Stripe & Resend

The website is a static site on GitHub Pages, so it has no server of its own.
A tiny **Cloudflare Worker** (in [`worker/`](worker/)) is the server piece that
holds the secrets. Both integrations run through it:

- **Stripe donations** → the Worker creates a **Checkout Session** for the exact
  amount (base, fee-covered, or custom), so the total is always accurate.
- **Forms (contact + apply)** → the Worker relays submissions to email via
  **Resend**.

The code is done. What's left are account steps that require logging into your
own accounts. **Deploy the Worker first** (§3) — donations and forms both
depend on it.

---

## 1. Stripe — donations via Checkout (test first, then live)

The donate page posts to the Worker, which creates the Stripe Checkout Session.
You don't create any Payment Links by hand — you only need to give the Worker a
**Stripe secret key**.

### Test mode (sandbox)
1. Sign in at **dashboard.stripe.com** and stay in the **Sandbox / Test mode**.
2. Grab the **test secret key** (`sk_test_...`): **Developers → API keys**, or
   the "API keys" card on the dashboard home → reveal the **Secret key**.
   *(This is available in the sandbox without the account-owner email.)*
3. Give it to the Worker (see §3):
   ```bash
   cd worker && npx wrangler secret put STRIPE_SECRET_KEY
   ```
4. **Test a donation:** on the donate page pick an amount (or a custom one),
   optionally tick "cover the fee", and pay with test card
   **4242 4242 4242 4242**, any future expiry, any CVC, any ZIP. The amount you
   see on the button is exactly what Checkout charges.

### Going live
- Finish **account activation** (business details + bank account) so Stripe can
  pay out. This is where the account-owner email (Drew's) will be needed.
- Get the **live** secret key (`sk_live_...`) and set it on the Worker:
  `npx wrangler secret put STRIPE_SECRET_KEY` — then redeploy.

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
2. Store the secrets:
   ```bash
   npx wrangler secret put STRIPE_SECRET_KEY   # sk_test_... — enables donations
   npx wrangler secret put RESEND_API_KEY      # re_... — enables forms (add later)
   ```
3. Deploy:
   ```bash
   npx wrangler deploy
   ```
   Copy the printed URL, e.g.
   `https://casadanovavida-forms.<your-subdomain>.workers.dev`.
4. Paste that URL into [`src/lib/config.ts`](src/lib/config.ts) as
   `WORKER_BASE` (replacing the `REPLACE-ME` placeholder).
5. Commit + push → GitHub Pages rebuilds.
6. **Test:** make a test donation on the live site, and (once Resend is set up)
   submit the contact form and confirm the email lands at `TO_EMAIL`.

---

## Quick status

| Piece | Code | Your account steps |
|-------|------|--------------------|
| Cloudflare Worker | ✅ written | `wrangler login`, deploy, paste URL into config |
| Donate page (Checkout) | ✅ ready | Add `STRIPE_SECRET_KEY` (test) to the Worker |
| Contact + apply forms | ✅ ready | Add `RESEND_API_KEY` to the Worker |
| Resend | — | Verify domain, create API key |
