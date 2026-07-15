// Progressive enhancement for the contact + apply forms.
// Each form is a normal HTML <form> that also works without JS (it POSTs
// straight to the Worker, which returns a thank-you page). When JS is on,
// we intercept, POST JSON, and swap in an inline success/error message so
// the visitor never leaves the page.

export function initForms() {
  const forms = document.querySelectorAll<HTMLFormElement>("form[data-forms-endpoint]");

  forms.forEach((form) => {
    const endpoint = form.dataset.formsEndpoint!;
    const submitBtn = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    const original = submitBtn?.textContent ?? "Submit";

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      clearError(form);

      if (!form.reportValidity()) return;

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Sending…";
      }

      const payload: Record<string, string> = {};
      new FormData(form).forEach((value, key) => {
        payload[key] = typeof value === "string" ? value : "";
      });

      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) {
          throw new Error(data.error || "Something went wrong. Please try again.");
        }
        showSuccess(form);
      } catch (err) {
        showError(form, err instanceof Error ? err.message : "Something went wrong.");
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = original;
        }
      }
    });
  });
}

function showSuccess(form: HTMLFormElement) {
  const heading = form.dataset.successHeading || "Thank you";
  const body =
    form.dataset.successBody ||
    "Your message has been sent. We typically respond within one business day.";

  const mark = `${import.meta.env.BASE_URL}images/logo/mark-navy.png`;

  // Tidy the card so the confirmation stands on its own: hide anything above
  // the form within its container (the "Send a confidential inquiry" heading).
  let sib = form.previousElementSibling as HTMLElement | null;
  while (sib) {
    sib.style.display = "none";
    sib = sib.previousElementSibling as HTMLElement | null;
  }

  const panel = document.createElement("div");
  panel.setAttribute("role", "status");
  panel.className =
    "relative overflow-hidden rounded-2xl border border-sand/60 bg-cream px-8 py-16 text-center";
  panel.innerHTML = `
    <img src="${mark}" alt="" aria-hidden="true" class="pointer-events-none absolute -bottom-8 -right-8 w-56 opacity-[0.06]" />
    <div class="relative">
      <div class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-pine text-linen ring-4 ring-sand">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>
      </div>
      <p class="mt-8 text-xs uppercase tracking-[0.24em] text-clay">Thank you</p>
      <h3 class="mt-3 font-display text-3xl text-pine sm:text-4xl">${escape(heading)}</h3>
      <p class="mx-auto mt-5 max-w-md leading-relaxed text-cocoa">${escape(body)}</p>
      <div class="mx-auto mt-10 h-px w-14 bg-gold/60"></div>
      <p class="mt-6 text-sm italic text-stone">With warmth, the Casa da Nova Vida community</p>
    </div>`;

  form.replaceWith(panel);
  panel.scrollIntoView({ behavior: "smooth", block: "center" });
}

function showError(form: HTMLFormElement, message: string) {
  clearError(form);
  const el = document.createElement("p");
  el.dataset.formError = "";
  el.setAttribute("role", "alert");
  el.className = "rounded-xl border border-clay/40 bg-clay/10 px-4 py-3 text-sm text-clay";
  el.textContent = message;
  form.prepend(el);
}

function clearError(form: HTMLFormElement) {
  form.querySelector("[data-form-error]")?.remove();
}

function escape(s: string) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}
