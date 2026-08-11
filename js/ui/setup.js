import { escapeHtml } from "../escape.js";

export function renderError(ui) {
  if (!ui.error) return "";
  return `<aside class="notice error" role="alert">
    <div class="section-kicker">Communications failure</div>
    <p>${escapeHtml(ui.error)}</p>
    ${ui.retryAction ? `<button type="button" id="retry-action">${escapeHtml(ui.retryLabel)}</button>` : ""}
  </aside>`;
}

// Shared by setup.js and interrogation.js — both screens can show a
// retryable error banner and need the same retry-button wiring.
export function bindRetry(ui, handlers) {
  const retryButton = document.getElementById("retry-action");
  if (!retryButton || !ui.retryAction) return;
  retryButton.addEventListener("click", () => {
    const action = ui.retryAction;
    handlers.clearError();
    action();
  });
}

export function renderSetup(app, state, ui, handlers) {
  const failed = Boolean(ui.setupError);
  const disconnected = Boolean(ui.error) && !state.busy;
  app.innerHTML = `<section class="shell setup-shell">
    <article class="setup-card">
      <div class="eyebrow">Major Crimes · Incoming File</div>
      ${failed ? `
        <h2>The file arrived corrupted.</h2>
        <p class="lede">The clerk could not make sense of the case notes. Request a clean file and begin again.</p>
        <button type="button" id="generate-case">Generate a New Case</button>
      ` : disconnected ? `
        <h2>The telephone line is silent.</h2>
        <p class="lede">The case file could not reach the room. Reconnect when the department is ready.</p>
      ` : `
        <div class="spinner" aria-hidden="true"></div>
        <h2>Assembling the case file…</h2>
        <p class="lede">Witness statements are being collected. Keep the room ready.</p>
      `}
      ${renderError(ui)}
    </article>
  </section>`;
  if (failed) document.getElementById("generate-case").addEventListener("click", handlers.beginInvestigation);
  bindRetry(ui, handlers);
}
