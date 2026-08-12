import { validatePayload, ValidationError } from "./validate.js";
import {
  MODEL, ANTHROPIC_VERSION, CALL_CONFIG,
  CASE_SCHEMA, REPLY_SCHEMA, VERDICT_SCHEMA,
  casePrompt, interrogationPrompt, judgePrompt
} from "./prompts.js";

const ENDPOINT = "https://api.anthropic.com/v1/messages";
const SCHEMAS = { case: CASE_SCHEMA, interrogate: REPLY_SCHEMA, judge: VERDICT_SCHEMA };

// Takes an ALREADY-VALIDATED payload. Every request field the Anthropic API
// sees originates here, never from the caller.
export function buildRequest(payload) {
  const config = CALL_CONFIG[payload.type];
  let system;
  let messages;

  if (payload.type === "case") {
    system = casePrompt();
    messages = [{ role: "user", content: "Generate the case." }];
  } else if (payload.type === "interrogate") {
    // Measured at 1327 input tokens for a representative case, above the
    // 1024-token floor, so the prefix genuinely caches. It is worth marking
    // because the interrogation prompt is re-sent verbatim for every question
    // put to the same suspect in the same tone — the common case by far.
    system = [{
      type: "text",
      text: interrogationPrompt(payload.caseFile, payload.suspectName, payload.tone),
      cache_control: { type: "ephemeral" }
    }];
    messages = [...payload.transcript, { role: "user", content: payload.question }];
  } else {
    system = judgePrompt(payload.caseFile);
    messages = [{
      role: "user",
      content: `I accuse ${payload.board.suspect} of the murder, with the ${payload.board.weapon}, in the ${payload.board.location}.`
    }];
  }

  return {
    model: MODEL,
    max_tokens: config.max_tokens,
    system,
    messages,
    output_config: {
      effort: config.effort,
      format: { type: "json_schema", schema: SCHEMAS[payload.type] }
    }
  };
}

export async function handleMessage(body, { apiKey, fetchImpl = fetch }) {
  let payload;
  try {
    payload = validatePayload(body);
  } catch (error) {
    if (error instanceof ValidationError) {
      return { status: error.status, json: { error: error.message } };
    }
    throw error;
  }

  if (!apiKey) {
    return { status: 500, json: { error: "ANTHROPIC_API_KEY is not set on the server." } };
  }

  let response;
  try {
    response = await fetchImpl(ENDPOINT, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json"
      },
      body: JSON.stringify(buildRequest(payload))
    });
  } catch {
    return { status: 502, json: { error: "The Anthropic API could not be reached." } };
  }

  if (!response.ok) {
    return { status: response.status, json: { error: `Upstream error ${response.status}.` } };
  }

  const data = await response.json();

  if (data.stop_reason === "max_tokens") {
    return { status: 502, json: { error: "The reply was truncated before it finished." } };
  }
  if (data.stop_reason === "refusal") {
    return { status: 502, json: { error: "The department declined to take that line of questioning." } };
  }

  const text = (data.content || [])
    .filter(block => block.type === "text")
    .map(block => block.text)
    .join("");

  try {
    // output_config.format guarantees valid JSON here — no fence stripping,
    // no brace hunting, no loose parser.
    return { status: 200, json: JSON.parse(text) };
  } catch {
    return { status: 502, json: { error: "The case notes came back unreadable." } };
  }
}

export const MAX_BODY_BYTES = 256 * 1024;

// An absent Origin means a same-origin or non-browser request. An empty
// allowlist means local development, where the origin varies.
export function isAllowedOrigin(origin, allowedOrigins) {
  if (!origin) return true;
  if (allowedOrigins.length === 0) return true;
  return allowedOrigins.includes(origin);
}

// Requiring application/json forces a CORS preflight, which closes the
// text/plain simple-request path that lets any page spend the key.
export function assertPostable(headers) {
  const contentType = headers["content-type"] || "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new ValidationError("Content-Type must be application/json.", 415);
  }
  const declared = Number.parseInt(headers["content-length"] || "0", 10);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw new ValidationError("Request body is too large.", 413);
  }
}
