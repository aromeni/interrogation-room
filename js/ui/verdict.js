import { escapeHtml } from "../escape.js";

// The only screen allowed to render the answer key. It is reached in exactly
// two ways: a correct arrest, or the second failed one. Everything before
// that point must keep murderer/weapon/location/motive out of the DOM.
function renderSolution(caseFile) {
  return `<div class="solution-grid">
      <div class="solution-item"><span class="stamp-label">Murderer</span><strong>${escapeHtml(caseFile.murderer)}</strong></div>
      <div class="solution-item"><span class="stamp-label">Weapon</span><strong>${escapeHtml(caseFile.weapon)}</strong></div>
      <div class="solution-item"><span class="stamp-label">Location</span><strong>${escapeHtml(caseFile.location)}</strong></div>
    </div>
    <p class="lede"><span class="stamp-label">Motive</span><br>${escapeHtml(caseFile.murderer_motive)}</p>`;
}

export function renderVerdict(app, state, ui, handlers) {
  const won = Boolean(ui.verdictWon);
  const caseFile = state.caseFile;
  app.innerHTML = `<section class="shell verdict-shell">
    <article class="verdict-card ${won ? "won" : "lost"}">
      <div class="eyebrow">${won ? "Case Closed · Final report" : "Case Cold · Final report"}</div>
      <hr class="rule">
      <h1 class="verdict-word ${won ? "" : "failed"}">${won ? "Guilty" : "Unsolved"}</h1>
      <p class="lede">${won ? "The room did its work." : "The file closes with the desk out of warrants."}</p>
      <p class="verdict-copy typewriter">${escapeHtml(ui.verdictText)}</p>
      ${renderSolution(caseFile)}
      <button type="button" id="new-case" class="primary-action">New Case</button>
    </article>
  </section>`;
  document.getElementById("new-case").addEventListener("click", handlers.beginInvestigation);
}
