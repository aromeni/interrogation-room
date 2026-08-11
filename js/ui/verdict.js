import { escapeHtml } from "../escape.js";

export function renderVerdict(app, state, ui, handlers) {
  const title = ui.verdictWon ? "Guilty" : "Case Closed";
  const caseFile = state.caseFile;
  app.innerHTML = `<section class="shell verdict-shell">
    <article class="verdict-card">
      <div class="eyebrow">Final report</div>
      <hr class="rule">
      <h1 class="verdict-word ${ui.verdictWon ? "" : "failed"}">${title}</h1>
      <p class="verdict-copy">${escapeHtml(ui.verdictText)}</p>
      <div class="solution-grid">
        <div class="solution-item"><span class="stamp-label">Murderer</span><strong>${escapeHtml(caseFile.murderer)}</strong></div>
        <div class="solution-item"><span class="stamp-label">Weapon</span><strong>${escapeHtml(caseFile.weapon)}</strong></div>
        <div class="solution-item"><span class="stamp-label">Location</span><strong>${escapeHtml(caseFile.location)}</strong></div>
      </div>
      <p class="lede"><span class="stamp-label">Motive</span><br>${escapeHtml(caseFile.murderer_motive)}</p>
      <button type="button" id="new-case" class="primary-action">New Case</button>
    </article>
  </section>`;
  document.getElementById("new-case").addEventListener("click", handlers.beginInvestigation);
}
