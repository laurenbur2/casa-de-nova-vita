/**
 * Casa da Nova Vida — website backend Worker
 * ------------------------------------------------------------
 * Two jobs, routed by path:
 *   POST /donate  → create a Stripe Checkout Session and return its URL
 *   POST /        → relay a contact/apply form submission via Resend
 *
 * Both need secrets the static GitHub Pages site can't safely hold, which
 * is why they live here.
 *
 * Secrets (wrangler secret put ...):
 *   STRIPE_SECRET_KEY  — sk_test_... (sandbox) / sk_live_... (live)
 *   RESEND_API_KEY     — re_...
 * Vars (wrangler.toml [vars]):
 *   FROM_EMAIL, TO_EMAIL, ALLOWED_ORIGINS
 */

// Keep this in sync with the client (donate.astro): the extra a donor adds
// when they opt to "cover the processing fee".
const FEE_RATE = 0.03;

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== "POST") {
      return json({ ok: false, error: "Method not allowed" }, 405, cors);
    }

    const path = new URL(request.url).pathname.replace(/\/+$/, "");
    if (path.endsWith("/donate")) {
      return handleDonate(request, env, cors);
    }
    return handleForm(request, env, cors);
  },
};

// ---- donations -------------------------------------------------------

async function handleDonate(request, env, cors) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Bad request" }, 400, cors);
  }

  const amount = Number(body.amount);
  const frequency = body.frequency === "monthly" ? "monthly" : "once";
  const coverFee = body.coverFee === true;

  if (!Number.isFinite(amount) || amount < 1 || amount > 100000) {
    return json({ ok: false, error: "Please enter an amount of $1 or more." }, 422, cors);
  }

  // Return URL must point back at our own site.
  const allowed = originList(env);
  const returnTo = String(body.returnTo || "");
  if (!allowed.some((o) => returnTo.startsWith(o + "/") || returnTo === o)) {
    return json({ ok: false, error: "Invalid return URL" }, 400, cors);
  }
  const sep = returnTo.includes("?") ? "&" : "?";
  const successUrl = `${returnTo}${sep}donation=success`;
  const cancelUrl = `${returnTo}${sep}donation=cancelled`;

  const unitAmount = Math.round((coverFee ? amount * (1 + FEE_RATE) : amount) * 100);

  const params = new URLSearchParams();
  params.set("cancel_url", cancelUrl);
  params.set("line_items[0][quantity]", "1");
  params.set("line_items[0][price_data][currency]", "usd");
  params.set("line_items[0][price_data][unit_amount]", String(unitAmount));
  params.set(
    "line_items[0][price_data][product_data][name]",
    frequency === "monthly"
      ? "Monthly donation to Casa da Nova Vida"
      : "Donation to Casa da Nova Vida",
  );

  if (frequency === "monthly") {
    params.set("mode", "subscription");
    params.set("line_items[0][price_data][recurring][interval]", "month");
    // Stripe requires success_url; template lets us confirm the session later.
    params.set("success_url", successUrl);
  } else {
    params.set("mode", "payment");
    params.set("submit_type", "donate"); // shows a "Donate" button at checkout
    params.set("success_url", successUrl);
  }

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.url) {
    console.error("Stripe error", res.status, JSON.stringify(data));
    return json(
      { ok: false, error: "We couldn't start checkout. Please try again." },
      502,
      cors,
    );
  }

  return json({ ok: true, url: data.url }, 200, cors);
}

// ---- forms (Resend) --------------------------------------------------

async function handleForm(request, env, cors) {
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
    body: JSON.stringify({ from: env.FROM_EMAIL, to, reply_to: email, subject, html, text }),
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
}

// ---- shared helpers --------------------------------------------------

function originList(env) {
  return (env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = originList(env);
  const allowOrigin = allowed.includes(origin) ? origin : allowed[0] || "*";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

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
