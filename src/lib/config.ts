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

// Google Analytics 4 measurement ID (looks like "G-XXXXXXXXXX"). Create the
// property at analytics.google.com → Admin → Data Streams → Web, then paste the
// ID below (or set PUBLIC_GA_MEASUREMENT_ID in the build environment).
//
// Leave it empty and no analytics script is emitted at all — so local builds and
// previews stay clean, and nothing breaks before the property exists.
export const GA_MEASUREMENT_ID =
  import.meta.env.PUBLIC_GA_MEASUREMENT_ID ?? "";
