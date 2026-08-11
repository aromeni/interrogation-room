import { STRESS_PER_POINT } from "./config.js";

let claimCounter = 0;

export function createState() {
  return {
    phase: "boot",
    caseFile: null,
    transcripts: {},
    stress: {},
    claims: {},
    activeSuspect: null,
    questionsAsked: 0,
    board: { suspect: "", weapon: "", location: "" },
    accusationsUsed: 0,
    selectedClaimIds: [],
    busy: false
  };
}

export function applyStress(state, name, points) {
  const next = (state.stress[name] || 0) + points * STRESS_PER_POINT;
  state.stress[name] = Math.min(100, next);
  return state.stress[name];
}

export function stressBand(value) {
  if (value > 65) return { className: "cracking", label: "Cracking" };
  if (value >= 30) return { className: "unsettled", label: "Unsettled" };
  return { className: "calm", label: "Calm" };
}

export function addClaim(state, suspectName, claim, questionNumber) {
  if (!state.claims[suspectName]) state.claims[suspectName] = [];
  if (!claim || !claim.assertion) return null;
  const entry = {
    id: `claim-${++claimCounter}`,
    suspectName,
    subject: claim.subject,
    assertion: claim.assertion,
    questionNumber,
    mark: null
  };
  state.claims[suspectName].push(entry);
  return entry;
}

export function findClaim(state, claimId) {
  for (const list of Object.values(state.claims)) {
    const found = list.find(entry => entry.id === claimId);
    if (found) return found;
  }
  return null;
}

// Marks toggle: applying the mark already present clears it.
export function markClaim(state, claimId, mark) {
  const claim = findClaim(state, claimId);
  if (!claim) return null;
  claim.mark = claim.mark === mark ? null : mark;
  return claim;
}

function isText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

// The schema guarantees shape and types; this re-checks the counts and
// cross-references that structured outputs cannot express.
export function isValidCase(caseFile) {
  if (!caseFile || typeof caseFile !== "object") return false;
  if (!caseFile.victim || !isText(caseFile.victim.name) || !isText(caseFile.victim.description)) return false;
  if (!Array.isArray(caseFile.suspects) || caseFile.suspects.length !== 3) return false;
  const wellFormed = caseFile.suspects.every(suspect =>
    suspect && isText(suspect.name) && isText(suspect.occupation) &&
    isText(suspect.personality_trait) && isText(suspect.secret_they_are_hiding));
  if (!wellFormed) return false;

  const names = caseFile.suspects.map(suspect => suspect.name);
  if (new Set(names).size !== 3) return false;
  if (!names.includes(caseFile.murderer)) return false;

  if (!isText(caseFile.weapon) || !isText(caseFile.location) || !isText(caseFile.murderer_motive)) return false;

  if (!Array.isArray(caseFile.forensics) || caseFile.forensics.length !== 3) return false;
  if (!caseFile.forensics.every(entry => entry && isText(entry.finding) && isText(entry.rules_out))) return false;

  if (!Array.isArray(caseFile.weapon_candidates) || caseFile.weapon_candidates.length !== 5) return false;
  if (!caseFile.weapon_candidates.every(isText)) return false;
  if (new Set(caseFile.weapon_candidates).size !== 5) return false;
  if (!caseFile.weapon_candidates.includes(caseFile.weapon)) return false;

  if (!Array.isArray(caseFile.location_candidates) || caseFile.location_candidates.length !== 5) return false;
  if (!caseFile.location_candidates.every(isText)) return false;
  if (new Set(caseFile.location_candidates).size !== 5) return false;
  if (!caseFile.location_candidates.includes(caseFile.location)) return false;

  if (!Array.isArray(caseFile.alibis) || caseFile.alibis.length !== 2) return false;
  return caseFile.alibis.every(entry => entry && isText(entry.suspect) && isText(entry.alibi));
}
