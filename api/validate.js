export class ValidationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "ValidationError";
    this.status = status;
  }
}

export function parsePort(raw) {
  if (raw === undefined || raw === "") return 3000;
  if (!/^\d+$/.test(raw.trim())) {
    throw new ValidationError(`PORT must be a number, got "${raw}".`);
  }
  const port = Number.parseInt(raw, 10);
  if (port < 1 || port > 65535) {
    throw new ValidationError(`PORT must be between 1 and 65535, got ${port}.`);
  }
  return port;
}

const CALL_TYPES = new Set(["case", "interrogate", "judge"]);
const TONES = new Set(["press", "sympathise", "straight"]);

// A soft brake on runaway sessions, not a security boundary — see the plan's
// hosting notes. Each question adds two entries (the question and the reply).
export const MAX_TRANSCRIPT_ENTRIES = 120;

function requireString(value, field, maxLength = 2000) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ValidationError(`${field} must be a non-empty string.`);
  }
  if (value.length > maxLength) {
    throw new ValidationError(`${field} exceeds ${maxLength} characters.`);
  }
  return value;
}

function requireCaseFile(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError("caseFile must be an object.");
  }
  return value;
}

function requireTranscript(value) {
  if (!Array.isArray(value)) {
    throw new ValidationError("transcript must be an array.");
  }
  if (value.length > MAX_TRANSCRIPT_ENTRIES) {
    throw new ValidationError("This interrogation has run long. Start a new case.");
  }
  return value.map(turn => {
    if (!turn || typeof turn !== "object") {
      throw new ValidationError("Each transcript turn must be an object.");
    }
    if (turn.role !== "user" && turn.role !== "assistant") {
      throw new ValidationError("Each transcript turn needs role user or assistant.");
    }
    return { role: turn.role, content: requireString(turn.content, "turn content") };
  });
}

// Returns a NEW object built only from recognised fields. Anything the client
// sends that is not named here — model, max_tokens, system, tools — is dropped.
export function validatePayload(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ValidationError("Request body must be a JSON object.");
  }
  if (!CALL_TYPES.has(body.type)) {
    throw new ValidationError(`Unknown call type: ${String(body.type)}.`);
  }

  if (body.type === "case") return { type: "case" };

  if (body.type === "interrogate") {
    if (!TONES.has(body.tone)) {
      throw new ValidationError(`Unknown tone: ${String(body.tone)}.`);
    }
    return {
      type: "interrogate",
      caseFile: requireCaseFile(body.caseFile),
      suspectName: requireString(body.suspectName, "suspectName", 200),
      question: requireString(body.question, "question", 1000),
      tone: body.tone,
      transcript: requireTranscript(body.transcript)
    };
  }

  const board = body.board;
  if (!board || typeof board !== "object") {
    throw new ValidationError("board must be an object.");
  }
  return {
    type: "judge",
    caseFile: requireCaseFile(body.caseFile),
    board: {
      suspect: requireString(board.suspect, "board.suspect", 200),
      weapon: requireString(board.weapon, "board.weapon", 200),
      location: requireString(board.location, "board.location", 200)
    }
  };
}
