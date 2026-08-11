import test from "node:test";
import assert from "node:assert/strict";
import {
  createState, applyStress, stressBand, addClaim, markClaim, isValidCase
} from "../js/state.js";

function validCase() {
  return {
    victim: { name: "Lord Ash", description: "A collector." },
    suspects: [
      { name: "A", occupation: "o", personality_trait: "t", secret_they_are_hiding: "s" },
      { name: "B", occupation: "o", personality_trait: "t", secret_they_are_hiding: "s" },
      { name: "C", occupation: "o", personality_trait: "t", secret_they_are_hiding: "s" }
    ],
    murderer: "B",
    weapon: "Brass Candlestick",
    location: "The Conservatory",
    murderer_motive: "Debt.",
    alibis: [{ suspect: "A", alibi: "Reading." }, { suspect: "C", alibi: "Asleep." }],
    forensics: [
      { finding: "Blunt force.", rules_out: "blades" },
      { finding: "Greenhouse soil.", rules_out: "the drive" },
      { finding: "No forced entry.", rules_out: "an intruder" }
    ],
    weapon_candidates: ["Brass Candlestick", "Letter Opener", "Rope", "Poison", "Revolver"],
    location_candidates: ["The Conservatory", "The Study", "The Cellar", "The Drive", "The Attic"]
  };
}

test("stress accumulates and clamps at 100", () => {
  const state = createState();
  applyStress(state, "A", 3);
  assert.equal(state.stress.A, 36);
  applyStress(state, "A", 3);
  applyStress(state, "A", 3);
  assert.equal(state.stress.A, 100);
});

test("stress bands cross at the documented thresholds", () => {
  assert.equal(stressBand(0).className, "calm");
  assert.equal(stressBand(29).className, "calm");
  assert.equal(stressBand(30).className, "unsettled");
  assert.equal(stressBand(65).className, "unsettled");
  assert.equal(stressBand(66).className, "cracking");
});

test("addClaim files a claim under its suspect with a stable id", () => {
  const state = createState();
  const claim = addClaim(state, "A", { subject: "A", assertion: "Was in the study." }, 3);
  assert.equal(state.claims.A.length, 1);
  assert.equal(state.claims.A[0].questionNumber, 3);
  assert.ok(claim.id);
});

test("addClaim ignores a null claim", () => {
  const state = createState();
  addClaim(state, "A", null, 1);
  assert.deepEqual(state.claims.A, []);
});

test("markClaim toggles marginalia", () => {
  const state = createState();
  const claim = addClaim(state, "A", { subject: "A", assertion: "x" }, 1);
  markClaim(state, claim.id, "doubt");
  assert.equal(state.claims.A[0].mark, "doubt");
  markClaim(state, claim.id, "doubt");
  assert.equal(state.claims.A[0].mark, null);
});

test("isValidCase accepts a well-formed case", () => {
  assert.equal(isValidCase(validCase()), true);
});

test("isValidCase rejects a murderer who is not a suspect", () => {
  const bad = validCase();
  bad.murderer = "Nobody";
  assert.equal(isValidCase(bad), false);
});

test("isValidCase rejects a real weapon missing from its candidate list", () => {
  const bad = validCase();
  bad.weapon_candidates = ["Rope", "Poison", "Revolver", "Dagger", "Wrench"];
  assert.equal(isValidCase(bad), false);
});

test("isValidCase rejects the wrong number of forensics", () => {
  const bad = validCase();
  bad.forensics = bad.forensics.slice(0, 2);
  assert.equal(isValidCase(bad), false);
});
