/**
 * Casa da Nova Vida — form relay Worker
 * ------------------------------------------------------------
 * Receives submissions from the contact and apply forms and emails
 * them via Resend. The Resend API key lives here as a secret so it is
 * never exposed to the browser (which is why forms cannot call Resend
 * directly from the static GitHub Pages site).
 *
 * Config (see wrangler.toml [vars] and secrets):
 *   RESEND_API_KEY  — secret,  `wrangler secret put RESEND_API_KEY`
 *   FROM_EMAIL      — var, e.g. "Casa da Nova Vida <forms@casadanovavida.com>"
 *                     (domain must be verified in Resend)
 *   TO_EMAIL        — var, comma-separated list of recipients
 *   ALLOWED_ORIGINS — var, comma-separated list of allowed site origins
 */

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGINS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const allowOrigin = allowed.includes(origin) ? origin : allowed[0] || "*";

    const cors = {
      "Access-Control-Allow-Origin": allowOrigin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      Vary: "Origin",
    };

    // Preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    if (request.method !== "POST") {
      return json({ ok: false, error: "Method not allowed" }, 405, cors);
    }

    // Parse either JSON (fetch) or urlencoded/multipart (no-JS <form> POST).
    let fields = {};
    const ct = request.headers.get("Content-Type") || "";
    try {
      if (ct.includes("application/json")) {
        fields = await request.json();
      } else {
        const form = await request.formData();
        for (const [k, v] of form.entries()) fields[k] = v;
      }
    } catch {
      return json({ ok: false, error: "Could not read submission" }, 400, cors);
    }

    // Honeypot: real users never fill this hidden field. Pretend success.
    if (fields._gotcha) {
      return respond(request, cors, true);
    }

    const email = String(fields.email || "").trim();
    const looksLikeEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
    const hasMessage = String(fields.message || "").trim().length > 0;
    if (!looksLikeEmail || !hasMessage) {
      return json({ ok: false, error: "Please fill in the required fields." }, 422, cors);
    }

    const formType = String(fields._formType || "inquiry");
    const subject =
      String(fields._subject || "").trim() ||
      (formType === "application"
        ? "New guest application — Casa da Nova Vida"
        : "New inquiry — Casa da Nova Vida");

    const { html, text } = renderEmail(fields, subject);

    const to = (env.TO_EMAIL || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.FROM_EMAIL,
        to,
        reply_to: email,
        subject,
        html,
        text,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("Resend error", res.status, detail);
      return json(
        { ok: false, error: "We couldn't send your message. Please email us directly." },
        502,
        cors,
      );
    }

    return respond(request, cors, true);
  },
};

// ---- helpers ---------------------------------------------------------

// Human-friendly labels for known field names; unknown fields fall back
// to a de-slugged version so the email stays readable if forms change.
const LABELS = {
  name: "Name",
  first_name: "First name",
  last_name: "Last name",
  email: "Email",
  phone: "Phone",
  birthday: "Date of birth",
  inquiry_for: "Inquiry is for",
  application_for: "Application is for",
  journey_stage: "Journey stage",
  message: "Message",
};

function renderEmail(fields, subject) {
  const rows = Object.entries(fields)
    .filter(([k]) => !k.startsWith("_"))
    .map(([k, v]) => [LABELS[k] || deslug(k), String(v)]);

  const text = rows.map(([k, v]) => `${k}: ${v}`).join("\n");

  const htmlRows = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 14px 6px 0;color:#5b6470;vertical-align:top;white-space:nowrap">${escapeHtml(
          k,
        )}</td><td style="padding:6px 0;color:#1f2933">${escapeHtml(v).replace(/\n/g, "<br>")}</td></tr>`,
    )
    .join("");

  const html = `<div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto">
  <h2 style="color:#274539;font-weight:600;margin:0 0 16px">${escapeHtml(subject)}</h2>
  <table style="border-collapse:collapse;font-size:15px;line-height:1.5">${htmlRows}</table>
  <p style="margin-top:24px;font-size:12px;color:#8a929c">Sent from the Casa da Nova Vida website.</p>
</div>`;

  return { html, text };
}

function deslug(s) {
  return s.replace(/[_-]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function json(body, status, cors) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

// JSON callers (the site's fetch) get JSON. A plain no-JS <form> POST
// (Accept: text/html) gets a simple confirmation page instead.
function respond(request, cors, ok) {
  const accept = request.headers.get("Accept") || "";
  if (accept.includes("text/html")) {
    return new Response(
      `<!doctype html><meta charset="utf-8"><title>Thank you</title>
<body style="font-family:system-ui;max-width:32rem;margin:15vh auto;padding:0 1.5rem;text-align:center;color:#1f2933">
<h1 style="color:#274539">Thank you</h1>
<p>Your message has been sent. We typically respond within one business day.</p>
<p><a href="javascript:history.back()" style="color:#3a6a53">Go back</a></p>`,
      { status: 200, headers: { "Content-Type": "text/html", ...cors } },
    );
  }
  return json({ ok }, 200, cors);
}
