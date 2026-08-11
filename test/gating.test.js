import test from "node:test";
import assert from "node:assert/strict";
import { isAllowedOrigin, assertPostable, MAX_BODY_BYTES } from "../api/handler.js";
import { ValidationError } from "../api/validate.js";

test("a same-origin request with no Origin header is allowed", () => {
  assert.equal(isAllowedOrigin(undefined, ["https://game.example"]), true);
});

test("a listed origin is allowed", () => {
  assert.equal(isAllowedOrigin("https://game.example", ["https://game.example"]), true);
});

test("an unlisted origin is refused", () => {
  assert.equal(isAllowedOrigin("https://evil.example", ["https://game.example"]), false);
});

test("an empty allowlist permits any origin, for local development", () => {
  assert.equal(isAllowedOrigin("http://localhost:5173", []), true);
});

test("assertPostable rejects text/plain, the CORS simple-request loophole", () => {
  assert.throws(() => assertPostable({ "content-type": "text/plain" }), ValidationError);
});

test("assertPostable accepts application/json with a charset", () => {
  assert.doesNotThrow(() => assertPostable({ "content-type": "application/json; charset=utf-8" }));
});

test("assertPostable rejects a body over the cap", () => {
  assert.throws(
    () => assertPostable({ "content-type": "application/json", "content-length": String(MAX_BODY_BYTES + 1) }),
    ValidationError
  );
});
