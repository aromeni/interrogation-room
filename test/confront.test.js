import test from "node:test";
import assert from "node:assert/strict";
import { buildConfrontation } from "../js/confront.js";

const ASHFORD = { id: "c1", suspectName: "Ashford", subject: "Vance", assertion: "Vance was in the conservatory at nine." };
const VANCE = { id: "c2", suspectName: "Vance", subject: "Vance", assertion: "I was in the study all evening." };

test("confronts the second-selected suspect with the first's claim", () => {
  const result = buildConfrontation(ASHFORD, VANCE);
  assert.equal(result.suspectName, "Vance");
  assert.match(result.question, /Ashford says/);
  assert.match(result.question, /conservatory at nine/);
});

test("quotes only the one claim, never a transcript", () => {
  const result = buildConfrontation(ASHFORD, VANCE);
  assert.equal(result.question.includes("I was in the study"), false);
});

test("refuses to confront a suspect with their own claim", () => {
  assert.equal(buildConfrontation(VANCE, VANCE), null);
});

test("refuses when either claim is missing", () => {
  assert.equal(buildConfrontation(ASHFORD, null), null);
  assert.equal(buildConfrontation(null, VANCE), null);
});
