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
  const cancelUrl = `${returnTo}${sep}donation=cancelled`;

  // On success, send the donor to a dedicated thank-you page when the client
  // provides one (validated against our own origins); otherwise fall back to
  // the donate page with a success flag.
  const successTo = String(body.successTo || "");
  const successUrl =
    successTo && allowed.some((o) => successTo.startsWith(o + "/") || successTo === o)
      ? successTo
      : `${returnTo}${sep}donation=success`;

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
  // Contact form uses `message`; the application uses `situation` for its
  // main free-text answer. Accept either as the required message.
  const hasMessage =
    String(fields.message || fields.situation || "").trim().length > 0;
  if (!looksLikeEmail || !hasMessage) {
    return json({ ok: false, error: "Please fill in the required fields." }, 422, cors);
  }

  const formType = String(fields._formType || "inquiry");
  const subject =
    formType === "application" ? "Application submission" : "Inquiry form submission";

  const { html, text } = renderEmail(fields, formType, subject);

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
  situation: "Briefly describe your situation and the support you're looking for",
  substances:
    "All drugs (street, alcohol, prescription, psychoactive & non-psychoactive) consumed in the last three months, and frequency",
  begin_stay: "When would you like to begin your stay at Nova Vida?",
  mental_health: "Ever diagnosed with a mental health disorder? What and when?",
  physical_health:
    "Any physical health issues (illness, allergy, limitation, pain, injury)?",
  how_heard: "How did you hear about us?",
  motivation: "What motivates you to seek a New Life?",
  additional_info: "Additional info / comments",
};

// Brand palette (from the website's global.css)
const BRAND = {
  pine: "#33506a",
  gold: "#c9ad63",
  linen: "#faf7ef",
  cream: "#f3ecdd",
  sand: "#e7ddc8",
  parchment: "#fffdf7",
  bark: "#2b3646",
  stone: "#8791a0",
  clay: "#4a7290",
};
const LOGO_URL =
  "https://laurenbur2.github.io/casa-de-nova-vita/images/logo/mark-cream.png";
const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "Arial, Helvetica, sans-serif";

const HIDE_IN_TABLE = new Set(["name", "first_name", "last_name"]);

function renderEmail(fields, formType, subject) {
  const rows = Object.entries(fields)
    .filter(([k]) => !k.startsWith("_") && !HIDE_IN_TABLE.has(k))
    .map(([k, v]) => [k, LABELS[k] || deslug(k), String(v)]);

  const displayName =
    String(fields.name || "").trim() ||
    `${fields.first_name || ""} ${fields.last_name || ""}`.trim() ||
    "Someone";
  const firstName = displayName.split(" ")[0];
  const submitterEmail = String(fields.email || "").trim();
  const isApp = formType === "application";
  const eyebrow = isApp ? "New guest application" : "New inquiry";
  const banner = isApp
    ? "New application — please review and respond promptly"
    : "New inquiry — please respond within one business day";

  const text =
    `${subject.toUpperCase()}\n${banner}\n\nFrom: ${displayName}\n\n` +
    rows.map(([, label, v]) => `${label}: ${v}`).join("\n") +
    `\n\nReply to this email to respond directly to ${displayName}.`;

  const linkStyle = `color:${BRAND.clay};font-weight:bold;text-decoration:underline;`;

  const htmlRows = rows
    .map(([key, label, v]) => {
      let val = escapeHtml(v).replace(/\n/g, "<br>");
      if (key === "email") {
        val = `<a href="mailto:${escapeHtml(v)}" style="${linkStyle}">${escapeHtml(v)}</a>`;
      } else if (key === "phone") {
        val = `<a href="tel:${escapeHtml(v.replace(/[^\d+]/g, ""))}" style="${linkStyle}">${escapeHtml(v)}</a>`;
      }
      if (key === "message") {
        return `<tr><td colspan="2" style="padding:16px 0 4px;">
          <div style="font-family:${SANS};font-size:11px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:${BRAND.stone};margin-bottom:8px;">${escapeHtml(label)}</div>
          <div style="font-family:${SANS};font-size:16px;line-height:1.6;color:${BRAND.bark};background:${BRAND.cream};border-left:4px solid ${BRAND.gold};padding:14px 16px;border-radius:6px;">${val}</div>
        </td></tr>`;
      }
      return `<tr>
        <td style="padding:11px 16px 11px 0;border-bottom:1px solid ${BRAND.sand};font-family:${SANS};font-size:11px;font-weight:bold;letter-spacing:0.6px;text-transform:uppercase;color:${BRAND.stone};vertical-align:top;width:32%;">${escapeHtml(label)}</td>
        <td style="padding:11px 0;border-bottom:1px solid ${BRAND.sand};font-family:${SANS};font-size:16px;font-weight:bold;line-height:1.5;color:${BRAND.bark};">${val}</td>
      </tr>`;
    })
    .join("");

  const replyBtn = submitterEmail
    ? `<a href="mailto:${escapeHtml(submitterEmail)}" style="display:inline-block;background:${BRAND.pine};color:${BRAND.linen};font-family:${SANS};font-size:15px;font-weight:bold;text-decoration:none;padding:13px 28px;border-radius:9999px;">Reply to ${escapeHtml(firstName)} &rarr;</a>`
    : "";

  const html = `<div style="margin:0;padding:28px 12px;background:${BRAND.cream};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;border-collapse:separate;">
    <tr>
      <td style="background:${BRAND.pine};padding:30px 24px 24px;text-align:center;border-radius:16px 16px 0 0;">
        <img src="${LOGO_URL}" width="54" height="54" alt="Casa da Nova Vida" style="display:block;margin:0 auto 10px;border:0;outline:none;" />
        <div style="font-family:${SERIF};font-size:22px;color:${BRAND.linen};letter-spacing:0.3px;">Casa da Nova Vida</div>
        <div style="font-family:${SANS};font-size:10px;letter-spacing:3px;text-transform:uppercase;color:${BRAND.gold};margin-top:6px;">House of Healing</div>
      </td>
    </tr>
    <tr>
      <td style="background:${BRAND.gold};padding:12px 24px;text-align:center;font-family:${SANS};font-size:13px;font-weight:bold;letter-spacing:0.3px;color:${BRAND.bark};">
        ${escapeHtml(banner)}
      </td>
    </tr>
    <tr>
      <td style="background:${BRAND.parchment};padding:28px 28px 4px;">
        <div style="font-family:${SANS};font-size:11px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:${BRAND.clay};">${escapeHtml(eyebrow)}</div>
        <div style="font-family:${SANS};font-size:27px;font-weight:bold;line-height:1.15;color:${BRAND.pine};margin:8px 0 18px;">${escapeHtml(displayName)}</div>
        ${replyBtn ? `<div style="margin-bottom:24px;">${replyBtn}</div>` : ""}
      </td>
    </tr>
    <tr>
      <td style="background:${BRAND.parchment};padding:0 28px 8px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${htmlRows}</table>
      </td>
    </tr>
    <tr>
      <td style="background:${BRAND.parchment};padding:20px 28px 30px;border-radius:0 0 16px 16px;">
        <div style="font-family:${SANS};font-size:12px;line-height:1.6;color:${BRAND.stone};">Sent from the Casa da Nova Vida website. You can also just hit reply — it goes straight to ${escapeHtml(displayName)}.</div>
      </td>
    </tr>
  </table>
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
