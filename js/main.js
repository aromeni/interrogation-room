import { createState, applyStress, addClaim, markClaim, findClaim, isValidCase } from "./state.js";
import { MAX_ACCUSATIONS } from "./config.js";
import { buildConfrontation } from "./confront.js";
import { callApi } from "./api.js";
import { renderBoot } from "./ui/boot.js";
import { renderSetup } from "./ui/setup.js";
import { renderInterrogation } from "./ui/interrogation.js";
import { renderVerdict } from "./ui/verdict.js";

const state = createState();

const ui = {
  error: null,
  retryAction: null,
  retryLabel: "Try Again",
  setupError: null,
  judgeClue: "",
  tone: "straight",
  verdictText: "",
  verdictWon: false,
  wrongElements: [],
  revealSolution: false
};

const app = document.getElementById("app");

// Restores every ui field to its boot-time value. Needed so a second
// playthrough (via "New Case") doesn't inherit a stale setupError,
// verdict, or clue banner from the previous game.
function resetUi() {
  Object.assign(ui, {
    error: null,
    retryAction: null,
    retryLabel: "Try Again",
    setupError: null,
    judgeClue: "",
    tone: "straight",
    verdictText: "",
    verdictWon: false,
    wrongElements: [],
    revealSolution: false
  });
}

function clearError() {
  ui.error = null;
  ui.retryAction = null;
  ui.retryLabel = "Try Again";
}

function setError(error, retryAction, retryLabel = "Try Again") {
  ui.error = error.message || "The line went dead — try that again.";
  ui.retryAction = retryAction;
  ui.retryLabel = retryLabel;
}

const handlers = {
  beginInvestigation,
  askQuestion,
  makeArrest,
  selectSuspect,
  updateBoard,
  clearError,
  selectClaim,
  toggleClaimMark,
  pinLine,
  confront,
  setTone
};

function render() {
  if (state.phase === "boot") return renderBoot(app, state, ui, handlers);
  if (state.phase === "setup") return renderSetup(app, state, ui, handlers);
  if (state.phase === "interrogation") return renderInterrogation(app, state, ui, handlers);
  return renderVerdict(app, state, ui, handlers);
}

function selectSuspect(name) {
  if (state.busy || !state.transcripts[name]) return;
  state.activeSuspect = name;
  ui.judgeClue = "";
  clearError();
  render();
  document.getElementById("question-input")?.focus();
}

function updateBoard(key, value) {
  state.board[key] = value;
  const normalized = value.trim();
  const stamp = document.getElementById(`stamp-${key}`);
  const slot = document.getElementById(`slot-${key}`);
  if (stamp) stamp.textContent = normalized || "???";
  if (slot) slot.classList.toggle("filled", Boolean(normalized));
  const arrestButton = document.getElementById("make-arrest");
  const complete = Object.values(state.board).every(item => item.trim());
  if (arrestButton) arrestButton.disabled = state.busy || !complete;
}

// Selection holds at most two cards. Selecting a third drops the oldest;
// clicking an already-selected card deselects it. Whether the pair actually
// contradicts is for the player to judge, not this function.
function selectClaim(claimId) {
  const index = state.selectedClaimIds.indexOf(claimId);
  if (index !== -1) {
    state.selectedClaimIds.splice(index, 1);
  } else {
    state.selectedClaimIds.push(claimId);
    if (state.selectedClaimIds.length > 2) state.selectedClaimIds.shift();
  }
  render();
}

// No render() — the select already shows the new value, and re-rendering here
// would blow away whatever the player has typed into the question box.
function setTone(tone) {
  ui.tone = tone;
}

function toggleClaimMark(claimId, mark) {
  markClaim(state, claimId, mark);
  render();
}

// Manual pin: files a suspect's own line as a claim verbatim, for cases the
// model's structured `claim` field didn't flag as one.
function pinLine(suspectName, text) {
  if (!text || !text.trim()) return;
  addClaim(state, suspectName, { subject: suspectName, assertion: text }, state.questionsAsked);
  render();
}

// Quotes one suspect's claim to another. Ordinary interrogation call, so it
// costs nothing extra — and only the single claim crosses between suspects,
// never a transcript.
function confront() {
  if (state.busy || state.selectedClaimIds.length !== 2) return;
  const [first, second] = state.selectedClaimIds.map(id => findClaim(state, id));
  const confrontation = buildConfrontation(first, second);
  if (!confrontation) {
    ui.error = "Pick two statements from two different suspects.";
    render();
    return;
  }
  state.selectedClaimIds = [];
  askQuestion(confrontation.suspectName, confrontation.question, "press");
}

async function beginInvestigation() {
  if (state.busy) return;
  Object.assign(state, createState());
  resetUi();
  clearError();
  state.phase = "setup";
  state.busy = true;
  render();

  try {
    let caseFile = await callApi({ type: "case" });
    if (!isValidCase(caseFile)) {
      // One retry, matching SKILL.md section 5.1.
      caseFile = await callApi({ type: "case" });
      if (!isValidCase(caseFile)) throw new Error("INVALID_CASE");
    }
    state.caseFile = caseFile;
    for (const suspect of caseFile.suspects) {
      state.transcripts[suspect.name] = [];
      state.stress[suspect.name] = 0;
      state.claims[suspect.name] = [];
    }
    state.activeSuspect = caseFile.suspects[0].name;
    state.phase = "interrogation";
  } catch (error) {
    if (error.message === "INVALID_CASE") ui.setupError = true;
    else setError(error, beginInvestigation, "Reconnect");
  } finally {
    state.busy = false;
    render();
  }
}

async function askQuestion(suspectName, question, tone) {
  if (state.busy || !question.trim()) return;
  clearError();
  ui.judgeClue = "";
  state.busy = true;
  state.activeSuspect = suspectName;

  const transcript = state.transcripts[suspectName];
  const priorTurns = [...transcript];
  transcript.push({ role: "user", content: question.trim() });
  render();

  try {
    const result = await callApi({
      type: "interrogate",
      caseFile: state.caseFile,
      suspectName,
      question: question.trim(),
      tone,
      transcript: priorTurns
    });
    const reply = result.reply.trim() || "…the suspect stays silent.";
    transcript.push({ role: "assistant", content: reply });
    applyStress(state, suspectName, result.stress);
    state.questionsAsked += 1;
    addClaim(state, suspectName, result.claim, state.questionsAsked);
  } catch (error) {
    const last = transcript.at(-1);
    if (last?.role === "user" && last.content === question.trim()) transcript.pop();
    const suspectAtFailure = suspectName;
    setError(error, () => {
      state.activeSuspect = suspectAtFailure;
      askQuestion(suspectAtFailure, question, tone);
    }, "Retry Question");
  } finally {
    state.busy = false;
    render();
  }
}

async function makeArrest() {
  if (state.busy) return;
  const { suspect, weapon, location } = state.board;
  if (!suspect || !weapon || !location) return;
  clearError();
  ui.judgeClue = "";
  state.busy = true;
  render();

  try {
    const result = await callApi({
      type: "judge",
      caseFile: state.caseFile,
      board: state.board
    });
    ui.verdictWon = result.correct;
    ui.verdictText = result.narration;
    ui.wrongElements = result.wrong_elements;

    if (result.correct) {
      state.phase = "verdict";
    } else {
      state.accusationsUsed += 1;
      if (state.accusationsUsed >= MAX_ACCUSATIONS) {
        state.phase = "verdict";
        ui.revealSolution = true;
      } else {
        // Stays on the interrogation screen — reuse the existing
        // "Warrant denied" banner (renderInterrogation) to surface the
        // narrator's in-world clue about which element was wrong.
        ui.judgeClue = result.narration;
      }
    }
  } catch (error) {
    setError(error, makeArrest, "Try the Arrest Again");
  } finally {
    state.busy = false;
    render();
  }
}

render();
