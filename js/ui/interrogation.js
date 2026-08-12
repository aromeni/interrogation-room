import { escapeHtml } from "../escape.js";
import { stressBand } from "../state.js";
import { SOFT_QUESTION_LIMIT, MAX_ACCUSATIONS, TONES } from "../config.js";
import { renderError, bindRetry } from "./setup.js";

function renderSuspectCard(suspect, index, state) {
  const selected = state.activeSuspect === suspect.name;
  const stress = state.stress[suspect.name] || 0;
  const stressView = stressBand(stress);
  return `<article class="suspect-card ${selected ? "selected" : ""} ${state.busy ? "disabled" : ""}"
      data-suspect="${escapeHtml(suspect.name)}" tabindex="${state.busy ? "-1" : "0"}" role="button"
      aria-pressed="${selected}" aria-disabled="${state.busy}">
    <span class="suspect-number">0${index + 1}</span>
    <div class="section-kicker">Person of interest</div>
    <h3>${escapeHtml(suspect.name)}</h3>
    <p class="occupation">${escapeHtml(suspect.occupation)}</p>
    <p class="trait">Observed: ${escapeHtml(suspect.personality_trait)}</p>
    <div class="stress-wrap ${stressView.className}" style="--stress: ${stress}%" aria-label="Demeanour: ${stressView.label}">
      <div class="stress-caption"><span>Demeanour</span><span>${stressView.label} <span class="sweat" aria-hidden="true">💧</span></span></div>
      <div class="stress-track"><div class="stress-fill"></div></div>
    </div>
  </article>`;
}

function renderTranscript(state) {
  if (!state.activeSuspect) {
    return `<div class="empty-transcript"><p>Select a dossier to bring a suspect into the room.</p></div>`;
  }
  const turns = state.transcripts[state.activeSuspect] || [];
  if (!turns.length && !state.busy) {
    return `<div class="empty-transcript"><p>The recorder is running.<br>Ask your first question.</p></div>`;
  }
  const exchanges = turns.map(turn => {
    const detective = turn.role === "user";
    // Manual pin: files this exact line as a claim even when the model's
    // structured `claim` field didn't flag it. Suspect turns only — the
    // detective's own questions aren't statements to hold anyone to.
    const pin = detective ? "" : `<button type="button" class="pin-line"
        data-pin-suspect="${escapeHtml(state.activeSuspect)}" data-pin-text="${escapeHtml(turn.content)}">Pin to notebook</button>`;
    return `<div class="exchange ${detective ? "detective" : "suspect"}">
      <div class="bubble">
        <div class="speaker">${detective ? "Detective" : escapeHtml(state.activeSuspect)}</div>
        <p>${escapeHtml(turn.content)}</p>
        ${pin}
      </div>
    </div>`;
  }).join("");
  const typing = state.busy && turns.length && turns[turns.length - 1].role === "user"
    ? `<div class="exchange suspect"><div class="bubble"><span class="typing">typing <i></i><i></i><i></i></span></div></div>`
    : "";
  return exchanges + typing;
}

// A single filed statement. The player marks it themselves (doubt / checks
// out) and selects it for a confrontation — nothing here compares one card
// against another. That comparison is the puzzle; it stays in the player's
// head, on purpose.
function renderClaimCard(claim, selected) {
  const marks = ["doubt", "checks"];
  const buttons = marks.map(mark => `
    <button type="button" class="mark ${claim.mark === mark ? "active" : ""}"
            aria-pressed="${claim.mark === mark}"
            data-claim-mark="${mark}" data-claim-id="${escapeHtml(claim.id)}">
      ${mark === "doubt" ? "Doubt this" : "Checks out"}
    </button>`).join("");
  return `<li class="claim-card ${selected ? "selected" : ""} ${claim.mark ? `marked-${claim.mark}` : ""}"
             data-claim-id="${escapeHtml(claim.id)}">
    <button type="button" class="claim-body" aria-pressed="${selected}" data-claim-select="${escapeHtml(claim.id)}">
      <span class="claim-q">Q${claim.questionNumber}</span>
      <span class="claim-assertion">${escapeHtml(claim.assertion)}</span>
    </button>
    <div class="claim-marks">${buttons}</div>
  </li>`;
}

// The case notebook: every claim filed so far, grouped under the suspect who
// made it. This is memory, not judgement — it must never flag, sort, or
// diff claims against each other, and it must never render caseFile.murderer,
// .weapon, .location, or .murderer_motive. Judging whether two selected cards
// contradict is the player's job; the button only counts the selection.
function renderNotebook(state) {
  const sections = state.caseFile.suspects.map(suspect => {
    const claims = state.claims[suspect.name] || [];
    const cards = claims.length
      ? claims.map(claim => renderClaimCard(claim, state.selectedClaimIds.includes(claim.id))).join("")
      : `<li class="claim-empty">Nothing on record.</li>`;
    return `<section class="notebook-suspect">
      <h4 class="section-kicker">${escapeHtml(suspect.name)}</h4>
      <ul>${cards}</ul>
    </section>`;
  }).join("");

  const selected = state.selectedClaimIds.length;
  return `<aside class="panel notebook">
    <div class="section-kicker">Case Notebook</div>
    <h2>Statements on Record</h2>
    ${sections}
    <button type="button" id="confront" class="primary-action" ${selected === 2 && !state.busy ? "" : "disabled"}>
      ${selected === 2 ? "Confront" : `Select two statements (${selected}/2)`}
    </button>
  </aside>`;
}

// The technique lever. Tone changes how the suspect answers — it is not an
// extra API call, just a different section of the same interrogation prompt.
function renderToneSelect(currentTone, disabled) {
  const options = TONES.map(tone =>
    `<option value="${escapeHtml(tone.value)}"${tone.value === currentTone ? " selected" : ""}>${escapeHtml(tone.label)}</option>`
  ).join("");
  return `<div class="tone-field">
    <label class="field-label" for="question-tone">Approach</label>
    <select id="question-tone" ${disabled ? "disabled" : ""}>${options}</select>
  </div>`;
}

function boardSlot(key, label, control, state) {
  const value = state.board[key].trim();
  return `<div class="board-slot ${value ? "filled" : ""}" id="slot-${key}">
    <div class="stamp-label">${label}</div>
    <div class="stamp-value" id="stamp-${key}">${value ? escapeHtml(value) : "???"}</div>
    ${control}
  </div>`;
}

// Renders the forensics report: three physical findings, each of which rules
// out one or more candidates. These are puzzle material (safe to show) — not
// the answer key. Never pass murderer/weapon/location/murderer_motive here.
function renderForensics(caseFile) {
  const rows = caseFile.forensics.map(entry => `
    <li class="forensic">
      <p class="finding">${escapeHtml(entry.finding)}</p>
      <p class="rules-out">Rules out: ${escapeHtml(entry.rules_out)}</p>
    </li>`).join("");
  return `<section class="forensics-report">
    <div class="section-kicker">Forensics · Preliminary</div>
    <ul>${rows}</ul>
  </section>`;
}

// "???" first, then every candidate. The real weapon/location legitimately
// appear as one of five options here — nothing marks which one is real.
function renderOptions(values, selected) {
  return [`<option value="">???</option>`]
    .concat(values.map(value =>
      `<option value="${escapeHtml(value)}"${value === selected ? " selected" : ""}>${escapeHtml(value)}</option>`))
    .join("");
}

function renderBoard(state) {
  const { caseFile, board } = state;
  const suspectNames = caseFile.suspects.map(suspect => suspect.name);
  const disabled = state.busy ? "disabled" : "";
  const complete = Object.values(board).every(value => value.trim());
  return `<aside class="panel board">
    ${renderForensics(caseFile)}
    <div class="section-kicker">Working theory</div>
    <h2>Evidence Board</h2>
    <p class="board-intro">Commit your theory. The desk grants two arrest warrants.</p>
    ${boardSlot("suspect", "Who", `<label class="sr-only" for="board-suspect">Suspect</label><select id="board-suspect" ${disabled}>${renderOptions(suspectNames, board.suspect)}</select>`, state)}
    ${boardSlot("weapon", "With what", `<label class="sr-only" for="board-weapon">Weapon</label><select id="board-weapon" ${disabled}>${renderOptions(caseFile.weapon_candidates, board.weapon)}</select>`, state)}
    ${boardSlot("location", "Where", `<label class="sr-only" for="board-location">Location</label><select id="board-location" ${disabled}>${renderOptions(caseFile.location_candidates, board.location)}</select>`, state)}
    <button type="button" id="make-arrest" ${disabled || !complete ? "disabled" : ""}>${state.busy ? "Reviewing Warrant…" : "Make the Arrest"}</button>
    <p class="attempts">Warrants remaining: ${MAX_ACCUSATIONS - state.accusationsUsed}</p>
  </aside>`;
}

function bindGameEvents(state, ui, handlers) {
  document.querySelectorAll(".suspect-card").forEach(card => {
    const choose = () => handlers.selectSuspect(card.dataset.suspect);
    card.addEventListener("click", choose);
    card.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        choose();
      }
    });
  });

  const questionInput = document.getElementById("question-input");
  const toneSelect = document.getElementById("question-tone");
  // Persisted on change rather than read only at submit, so the chosen
  // approach survives the re-render that every reply triggers.
  toneSelect?.addEventListener("change", event => handlers.setTone(event.target.value));
  const submitQuestion = () => {
    const question = questionInput.value.trim();
    if (!question) return;
    handlers.askQuestion(state.activeSuspect, question, toneSelect?.value || ui.tone);
  };
  document.getElementById("ask-question").addEventListener("click", submitQuestion);
  questionInput.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      submitQuestion();
    }
  });

  ["suspect", "weapon", "location"].forEach(key => {
    const control = document.getElementById(`board-${key}`);
    control.addEventListener("change", event => handlers.updateBoard(key, event.target.value));
  });
  document.getElementById("make-arrest").addEventListener("click", handlers.makeArrest);

  document.querySelectorAll("[data-claim-select]").forEach(button => {
    button.addEventListener("click", () => handlers.selectClaim(button.dataset.claimSelect));
  });
  document.querySelectorAll("[data-claim-mark]").forEach(button => {
    button.addEventListener("click", () => handlers.toggleClaimMark(button.dataset.claimId, button.dataset.claimMark));
  });
  document.getElementById("confront")?.addEventListener("click", handlers.confront);
  document.querySelectorAll(".pin-line").forEach(button => {
    button.addEventListener("click", () => handlers.pinLine(button.dataset.pinSuspect, button.dataset.pinText));
  });
}

export function renderInterrogation(app, state, ui, handlers) {
  const victim = state.caseFile.victim;
  const active = state.activeSuspect;
  app.innerHTML = `<section class="shell">
    <header class="case-header">
      <div>
        <div class="eyebrow">Confidential · Active Investigation</div>
        <h1>The Interrogation Room</h1>
      </div>
      <div class="counter">Question ${state.questionsAsked} of ~${SOFT_QUESTION_LIMIT}</div>
    </header>
    ${ui.judgeClue ? `<aside class="notice" role="status"><div class="section-kicker">Warrant denied</div><p>${escapeHtml(ui.judgeClue)}</p></aside>` : ""}
    ${renderError(ui)}
    <article class="panel victim-file">
      <div class="victim-mark" aria-hidden="true">†</div>
      <div class="section-kicker">The victim</div>
      <h2>${escapeHtml(victim.name)}</h2>
      <p>${escapeHtml(victim.description)}</p>
    </article>
    <div class="suspect-grid">${state.caseFile.suspects.map((suspect, index) => renderSuspectCard(suspect, index, state)).join("")}</div>
    <div class="case-grid">
      <section class="panel interview-panel">
        <header class="interview-heading">
          <div>
            <div class="section-kicker">Recorded interview</div>
            <h2>${active ? escapeHtml(active) : "Room Empty"}</h2>
          </div>
          ${active ? `<span class="counter"><span class="recording-dot"></span>On record</span>` : ""}
        </header>
        <div class="transcript" id="transcript" aria-label="Interview transcript" aria-live="polite" aria-atomic="false">${renderTranscript(state)}</div>
        <div class="question-box">
          <div class="question-actions">
            <div class="question-field">
              <label class="field-label" for="question-input">Your question</label>
              <input id="question-input" type="text" maxlength="500" autocomplete="off" placeholder="${active ? "Ask about the case…" : "Select a suspect first"}" ${!active || state.busy ? "disabled" : ""}>
            </div>
            ${renderToneSelect(ui.tone, !active || state.busy)}
            <button type="button" id="ask-question" ${!active || state.busy ? "disabled" : ""}>Question</button>
          </div>
        </div>
      </section>
      ${renderBoard(state)}
    </div>
    ${renderNotebook(state)}
  </section>`;
  bindGameEvents(state, ui, handlers);
  bindRetry(ui, handlers);
  requestAnimationFrame(() => {
    const transcript = document.getElementById("transcript");
    if (transcript) transcript.scrollTop = transcript.scrollHeight;
  });
}
