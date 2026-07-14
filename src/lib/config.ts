// Base URL of the Cloudflare Worker that backs the site (forms + donations).
// See ../../worker/README.md to deploy it, then paste the Worker URL here
// (or set PUBLIC_FORMS_ENDPOINT in the build environment).
//
// This URL is public by design — it only accepts POSTs and holds no secrets.
const WORKER_BASE = (
  import.meta.env.PUBLIC_FORMS_ENDPOINT ??
  "https://casadanovavida-forms.casadanovavida.workers.dev"
).replace(/\/+$/, "");

// Contact + apply forms POST here (Resend relay).
export const FORMS_ENDPOINT = WORKER_BASE;

// Donate page POSTs here to open a Stripe Checkout Session.
export const DONATE_ENDPOINT = `${WORKER_BASE}/donate`;
