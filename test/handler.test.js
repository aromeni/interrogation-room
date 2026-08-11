import test from "node:test";
import assert from "node:assert/strict";
import { buildRequest, handleMessage } from "../api/handler.js";
import { MODEL, CALL_CONFIG } from "../api/prompts.js";

const CASE_FILE = { victim: { name: "V", description: "d" }, suspects: [] };

test("buildRequest pins the model regardless of the payload", () => {
  const request = buildRequest({ type: "case" });
  assert.equal(request.model, MODEL);
  assert.equal(request.max_tokens, CALL_CONFIG.case.max_tokens);
  assert.equal(request.output_config.effort, "high");
});

test("buildRequest attaches the case schema for a case call", () => {
  const request = buildRequest({ type: "case" });
  assert.equal(request.output_config.format.type, "json_schema");
  assert.ok(request.output_config.format.schema.properties.forensics);
});

test("buildRequest sends only the suspect's own transcript plus the question", () => {
  const request = buildRequest({
    type: "interrogate",
    caseFile: CASE_FILE,
    suspectName: "Ada Vance",
    question: "Where were you?",
    tone: "straight",
    transcript: [{ role: "user", content: "Earlier question" }]
  });
  assert.equal(request.messages.length, 2);
  assert.equal(request.messages[1].content, "Where were you?");
  assert.match(request.system, /You are playing: Ada Vance/);
});

test("buildRequest applies low effort to interrogation", () => {
  const request = buildRequest({
    type: "interrogate", caseFile: CASE_FILE, suspectName: "A",
    question: "q", tone: "straight", transcript: []
  });
  assert.equal(request.output_config.effort, "low");
});

test("handleMessage returns parsed structured output", async () => {
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      stop_reason: "end_turn",
      content: [{ type: "text", text: '{"reply":"I was reading.","stress":1,"claim":null}' }]
    })
  });
  const result = await handleMessage(
    { type: "interrogate", caseFile: CASE_FILE, suspectName: "A",
      question: "q", tone: "straight", transcript: [] },
    { apiKey: "sk-test", fetchImpl }
  );
  assert.equal(result.status, 200);
  assert.equal(result.json.reply, "I was reading.");
  assert.equal(result.json.stress, 1);
});

test("handleMessage reports truncation instead of returning bad JSON", async () => {
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      stop_reason: "max_tokens",
      content: [{ type: "text", text: '{"reply":"I was rea' }]
    })
  });
  const result = await handleMessage(
    { type: "case" },
    { apiKey: "sk-test", fetchImpl }
  );
  assert.equal(result.status, 502);
  assert.match(result.json.error, /truncated/i);
});

test("handleMessage rejects a bad payload without calling the API", async () => {
  let called = false;
  const fetchImpl = async () => { called = true; };
  const result = await handleMessage(
    { type: "jailbreak" },
    { apiKey: "sk-test", fetchImpl }
  );
  assert.equal(result.status, 400);
  assert.equal(called, false);
});

test("handleMessage reports a missing key without calling the API", async () => {
  let called = false;
  const fetchImpl = async () => { called = true; };
  const result = await handleMessage(
    { type: "case" },
    { apiKey: undefined, fetchImpl }
  );
  assert.equal(result.status, 500);
  assert.equal(called, false);
});
