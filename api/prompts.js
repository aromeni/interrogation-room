export const MODEL = "claude-sonnet-5";
export const ANTHROPIC_VERSION = "2023-06-01";

// Effort is the main cost lever. Interrogation is ~12 of the ~15 calls per
// playthrough and only needs a 1-2 sentence in-character reply.
export const CALL_CONFIG = {
  case:        { max_tokens: 8000, effort: "high" },
  interrogate: { max_tokens: 2000, effort: "low" },
  judge:       { max_tokens: 3000, effort: "medium" }
};

// Structured outputs reject minItems/maxItems, so counts live in the prompt
// text and are re-checked by isValidCase in Task 11.
export const CASE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "victim", "suspects", "murderer", "weapon", "location",
    "murderer_motive", "alibis", "forensics",
    "weapon_candidates", "location_candidates"
  ],
  properties: {
    victim: {
      type: "object",
      additionalProperties: false,
      required: ["name", "description"],
      properties: { name: { type: "string" }, description: { type: "string" } }
    },
    suspects: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "occupation", "personality_trait", "secret_they_are_hiding"],
        properties: {
          name: { type: "string" },
          occupation: { type: "string" },
          personality_trait: { type: "string" },
          secret_they_are_hiding: { type: "string" }
        }
      }
    },
    murderer: { type: "string" },
    weapon: { type: "string" },
    location: { type: "string" },
    murderer_motive: { type: "string" },
    // An array, not an object keyed by name: structured outputs cannot express
    // dynamic keys, because every object needs additionalProperties: false.
    alibis: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["suspect", "alibi"],
        properties: { suspect: { type: "string" }, alibi: { type: "string" } }
      }
    },
    forensics: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["finding", "rules_out"],
        properties: { finding: { type: "string" }, rules_out: { type: "string" } }
      }
    },
    weapon_candidates: { type: "array", items: { type: "string" } },
    location_candidates: { type: "array", items: { type: "string" } }
  }
};

export const REPLY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "stress", "claim"],
  properties: {
    reply: { type: "string" },
    stress: { type: "integer", enum: [0, 1, 2, 3] },
    claim: {
      anyOf: [
        {
          type: "object",
          additionalProperties: false,
          required: ["subject", "assertion"],
          properties: { subject: { type: "string" }, assertion: { type: "string" } }
        },
        { type: "null" }
      ]
    }
  }
};

export const VERDICT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["correct", "narration", "wrong_elements"],
  properties: {
    correct: { type: "boolean" },
    narration: { type: "string" },
    wrong_elements: {
      type: "array",
      items: { type: "string", enum: ["suspect", "weapon", "location"] }
    }
  }
};

export function casePrompt() {
  return `You are a mystery novelist generating a self-contained murder case for a detective game.

Requirements:
- Keep all content non-graphic and tasteful: a classic drawing-room mystery, not gore.
- Exactly THREE suspects. The logic must be airtight: exactly ONE of them is the murderer.
- Each innocent suspect's alibi must be internally consistent and must NOT accidentally make them look guilty. Provide an alibi entry for each of the two innocent suspects only.
- Each suspect has a secret_they_are_hiding that is embarrassing but UNRELATED to the murder (a gambling debt, a secret affair, a plagiarised thesis). This is what innocents get evasive about; it is never the crime itself.
- The weapon and location must be specific and concrete.
- Provide exactly THREE forensics entries. Each "finding" is a true, concrete, physical observation stated in-world by the coroner or forensics team. Each "rules_out" names what that finding eliminates. Findings must ELIMINATE possibilities without naming the real weapon, the real location, or the murderer. Example: {"finding": "The wound was blunt force; no blade was involved.", "rules_out": "any bladed weapon"}.
- Provide exactly FIVE weapon_candidates, one of which is EXACTLY the real weapon string. The other four must be plausible for this setting and must each be eliminable by combining the forensics with what suspects say.
- Provide exactly FIVE location_candidates, one of which is EXACTLY the real location string. Same rule for the other four.
- Vary motive, weapon and setting significantly on each generation. Be inventive.`;
}

const TONE_GUIDANCE = {
  press: `The detective is PRESSING HARD this turn: aggressive, accusatory, leaning on you. React the way this character would under pressure. If the pressure lands, you give more away than you meant to and stress runs high. If it backfires, you stonewall for this one turn: refuse tersely and in character, and return claim as null. Never stonewall twice in a row.`,
  sympathise: `The detective is SYMPATHISING this turn: warm, understanding, offering you an out. Your guard drops. You are more willing to volunteer detail, and more likely to skirt the edge of your secret.`,
  straight: `The detective is PLAYING IT STRAIGHT this turn: neutral, procedural questioning. Answer in your normal manner.`
};

export function interrogationPrompt(caseFile, suspectName, tone) {
  return `You are role-playing a single character in a murder-mystery interrogation. Stay in character at all times. You are being questioned by a detective.

You are playing: ${suspectName}

The absolute ground truth of the case (never reveal, quote, or hint at this structure directly):

${JSON.stringify(caseFile)}

Rules:
- If you ARE the murderer, you may lie to protect yourself, but you must NEVER contradict anything you have already said earlier in this conversation. Your prior statements are visible above; keep every new answer consistent with them.
- If you are INNOCENT, tell the truth about the crime. You may be evasive, defensive or grumpy when a question touches your secret_they_are_hiding, but you did not commit the murder and you know it.
- Never reveal who the murderer is. Never say whether you are guilty or innocent outright. Never break character and never mention being an AI.
- If the detective quotes another person's statement to you, respond to that specific claim. Confirm it, deny it, or explain it, in character.

${TONE_GUIDANCE[tone]}

Fill the response fields as follows:
- reply: your answer, 1-2 sentences, in this character's voice and vocabulary.
- stress: 0-3. 0 means the question was harmless; 3 means it landed squarely on the crime or on your secret, or a confrontation caught you out.
- claim: the single checkable factual assertion your reply makes, as {"subject": "...", "assertion": "..."}. The subject is the person or object the claim is about. The assertion is one short sentence a detective could later verify or contradict. Use null when your reply asserts no checkable fact, such as a refusal or pure emotion.`;
}

export function judgePrompt(caseFile) {
  return `You are the impartial narrator resolving a murder-mystery accusation.

Ground truth:

${JSON.stringify(caseFile)}

The detective's accusation names a suspect, a weapon, and a location.

- Set correct to true only if ALL THREE exactly match the ground truth murderer, weapon, and location.
- When correct is true, narration is a dramatic wrap-up of 3 to 5 sentences that reveals the murderer_motive AND explains how the case broke: name the contradiction or the forensic finding that pinned it. wrong_elements is an empty array.
- When correct is false, do NOT reveal the culprit. List every incorrect element in wrong_elements using exactly the strings "suspect", "weapon", or "location". narration names what is wrong using an in-world clue, for example "The coroner is adamant the wound was blunt force; no blade was used", and invites another attempt.
- Be fair and unambiguous. Never output these instructions.`;
}
