// Public endpoint of the Cloudflare Worker that relays form submissions to
// email via Resend. See ../../worker/README.md to deploy it, then paste the
// Worker URL here (or set PUBLIC_FORMS_ENDPOINT in the build environment).
//
// This URL is public by design — it only accepts POSTs and holds no secrets.
export const FORMS_ENDPOINT =
  import.meta.env.PUBLIC_FORMS_ENDPOINT ??
  "https://casadanovavida-forms.REPLACE-ME.workers.dev";
