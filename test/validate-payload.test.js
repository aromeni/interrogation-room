import test from "node:test";
import assert from "node:assert/strict";
import { validatePayload, ValidationError } from "../api/validate.js";

const CASE_FILE = { victim: { name: "V", description: "d" }, suspects: [] };

test("accepts a case-generation payload", () => {
  assert.deepEqual(validatePayload({ type: "case" }), { type: "case" });
});

test("accepts an interrogation payload", () => {
  const result = validatePayload({
    type: "interrogate",
    caseFile: CASE_FILE,
    suspectName: "Ada Vance",
    question: "Where were you at nine?",
    tone: "press",
    transcript: [{ role: "user", content: "Hello" }]
  });
  assert.equal(result.suspectName, "Ada Vance");
  assert.equal(result.tone, "press");
});

test("strips a client-supplied model", () => {
  const result = validatePayload({ type: "case", model: "claude-opus-5" });
  assert.equal(result.model, undefined);
});

test("strips a client-supplied max_tokens", () => {
  const result = validatePayload({ type: "case", max_tokens: 200000 });
  assert.equal(result.max_tokens, undefined);
});

test("rejects an unknown call type", () => {
  assert.throws(() => validatePayload({ type: "jailbreak" }), ValidationError);
});

test("rejects an unknown tone", () => {
  assert.throws(
    () => validatePayload({
      type: "interrogate", caseFile: CASE_FILE, suspectName: "A",
      question: "q", tone: "torture", transcript: []
    }),
    ValidationError
  );
});

test("rejects a transcript longer than the ceiling", () => {
  const transcript = Array.from({ length: 200 }, () => ({ role: "user", content: "x" }));
  assert.throws(
    () => validatePayload({
      type: "interrogate", caseFile: CASE_FILE, suspectName: "A",
      question: "q", tone: "straight", transcript
    }),
    ValidationError
  );
});

test("rejects a non-object body", () => {
  assert.throws(() => validatePayload("hello"), ValidationError);
  assert.throws(() => validatePayload(null), ValidationError);
});
