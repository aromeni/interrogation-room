import test from "node:test";
import assert from "node:assert/strict";
import { parsePort, ValidationError } from "../api/validate.js";

test("parsePort defaults to 3000 when unset", () => {
  assert.equal(parsePort(undefined), 3000);
});

test("parsePort accepts a valid port", () => {
  assert.equal(parsePort("8080"), 8080);
});

test("parsePort rejects a trailing comment left by the .env parser", () => {
  assert.throws(() => parsePort("3001 # dev"), ValidationError);
});

test("parsePort rejects out-of-range ports", () => {
  assert.throws(() => parsePort("0"), ValidationError);
  assert.throws(() => parsePort("70000"), ValidationError);
});
