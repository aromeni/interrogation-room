# The Interrogation Room — Deduction, Craft, and Public Hosting

**Date:** 2026-08-11
**Status:** Approved, ready for planning

## Problem

`SKILL.md` says the player wins by "catching the murderer in a self-contradiction,
corroborated by physical facts." The shipped game does not support that. Every claim a
suspect makes lives in a scrollable transcript the player must hold in their head; suspects
cannot be confronted with each other's statements; and the win condition routes through
free-typing a weapon and location that were never revealed and cannot be deduced. Most
players guess.

Separately, the game is about to be hosted publicly as a portfolio piece, where the author's
API key pays for every stranger's playthrough.

## Goals

1. Make the deduction loop mechanically real — the player does the noticing, the game stops
   making them do the remembering.
2. Make it feel like a seasoned detective at work: craft and instinct, not clerical work.
3. Make the cost per playthrough predictable and the API key unspendable by third parties.

## Non-goals

- Pressure mechanics beyond a single technique lever. No hard question budget, no timer, no
  suspect who lawyers up permanently — a dead-ended playthrough is worse than an easy one.
- Replay and shareability features (difficulty tiers, score, share cards). Deliberately
  deferred; they drive traffic but do not fix the core loop.
- Streaming responses. Structured output makes partial JSON awkward to render, and at low
  effort the replies land fast enough that the existing "typing…" affordance covers it.

## Design

### The case file gains three fields, at zero extra cost

Case generation is already one model call returning JSON. Under a response schema it can
return more without a second call:

- **`forensics`** — three physical findings that are true, concrete, and *eliminating*
  without naming the answer. Example: "The wound was blunt force; no blade was involved."
  "Soil on the victim's shoes matches the greenhouse beds, not the gravel drive." These are
  shown on the evidence board from the start and are what make the weapon and location
  deducible rather than guessable.
- **`weapon_candidates`** and **`location_candidates`** — five each, exactly one of them
  real. The evidence board becomes three dropdowns instead of two free-text inputs.

Three suspects x five weapons x five locations is 75 combinations against two accusations, so
blind guessing succeeds under 3% of the time. This also retires the fuzzy "accept 'the
candlestick' for 'Brass Candlestick'" matching in the accusation judge, because the player
can only submit values that exist.

### The notebook fills itself; the player does the deducing

Each interrogation reply returns `{reply, stress, claim}` under a schema, where `stress` is an
integer 0–3 (replacing the old `[STRESS: +N]` tag, same 12-points-per-unit scaling) and
`claim` is `{subject, assertion}` or `null` — the one checkable factual assertion the suspect
just made, normalized. Claims stack into a per-suspect notebook panel, tagged with the
question number.
The player can also pin any line manually, so a claim the model did not flag is not lost.

**Contradictions are deliberately not auto-detected.** The system could compare claims and
highlight conflicts. It must not: that solves the puzzle for the player, which is the entire
thing being built. The notebook removes the memory burden and nothing else.

To keep it craft rather than clerical work:

- Claims render as index cards under each suspect's name, not as a log.
- Each card can be marked `doubt this` or `checks out` — the player's own marginalia, no
  model involvement.
- Confront is one click from two selected cards. No typing, no menu-diving.

### Confrontation is where the murderer cracks

Selecting a claim from suspect X and a card belonging to suspect Y, then hitting Confront,
injects **only that single claim** into Y's transcript as a detective turn:

> Ms Ashford says she saw you in the conservatory at nine. Explain.

This is another interrogation call, so it adds no cost. A landed confrontation spikes stress
hard.

**This knowingly breaks `SKILL.md` §10**, which says a suspect only ever receives their own
transcript. The break is accepted and deliberately narrow: one quoted claim crosses, never a
transcript. It is the only mechanic that turns the murderer's "never contradict yourself"
constraint into something a player can attack, which is the game `SKILL.md` describes.

### One technique lever

Each question carries a tone: **press hard**, **sympathise**, or **play it straight**. One
dropdown beside the question box, one line in the system prompt, no extra API call.

- Pressing spikes stress faster but risks the suspect clamming up **for a single turn**. The
  model decides whether the press lands or backfires, and signals a stonewalled turn by
  returning `claim: null` with a terse in-character refusal — no separate state flag.
- Sympathising lowers their guard, so secrets slip more readily.

There is no cross-interrogation consequence meter and no permanently closed suspect — a
playthrough must never become unwinnable.

### The arrest pays off the reasoning

A correct accusation currently returns a motive wrap-up. It should instead narrate *how the
case broke*: naming the contradiction the player exploited and the forensic finding that
pinned the weapon. That is the beat that distinguishes having been a detective from having
guessed correctly.

Unchanged from `SKILL.md`: three suspects, exactly one murderer, two accusations before the
reveal, `caseFile` never written to the DOM before the game ends.

## Architecture

### File layout

Buildless ES modules, no dependencies, served as static files. `SKILL.md` §2's single-file
constraint existed because the game ran as a Claude artifact; that constraint left the
building when `server.js` was added, and Vercel serves static files natively.

```
index.html          shell + <script type="module">
css/tokens.css      the noir palette as custom properties
css/game.css        components
js/config.js        model, limits, effort per call type
js/prompts.js       three system prompts + their JSON schemas
js/api.js           callModel, error mapping
js/state.js         state + mutations (stress, claims, board)
js/ui/*.js          one module per screen: boot, setup, interrogation, verdict
js/main.js          event wiring and game flow
```

Each file stays small enough to hold in context at once, which the current 1374-line
`index.html` does not.

### Model API changes

1. **Structured outputs (`output_config.format`) on all three calls.** Case generation
   returns the case file plus `forensics` and the candidate lists; interrogation returns
   `{reply, stress, claim}`; the judge returns `{verdict, narration, wrong_elements}`. This
   deletes the `[STRESS: +N]` regex, the markdown-fence stripper, and the loose JSON parser,
   and eliminates the "file arrived corrupted" failure mode they cause.

2. **`max_tokens` gets real headroom and `stop_reason` is checked.** Adaptive thinking is on
   by default on `claude-sonnet-5` and shares the `max_tokens` budget with the response,
   which is why the current value of 1000 truncates the case file. `stop_reason ==
   "max_tokens"` must be distinguishable from a normal completion.

3. **Effort tuned per call — the main cost lever.** Interrogation is roughly 12 of the ~15
   calls per playthrough and needs only a 1–2 sentence in-character reply, so it runs at
   `effort: "low"`. Case generation needs airtight logic and runs `high`. The judge runs
   `medium`.

4. **Prompt caching on the per-suspect system prompt**, which is byte-stable for the whole
   game. Conditional on measurement: Sonnet 5's minimum cacheable prefix is 1024 tokens and
   the case-file prompt may fall just under it. Verify with `count_tokens` before relying on
   the saving.

### Cost

At Sonnet 5 pricing ($3/$15 per MTok; $2/$10 introductory through 2026-08-31), an unoptimised
playthrough of 1 case generation + ~12 interrogations + 1–2 judge calls estimates at
**$0.12–0.18** — about $15 per 100 playthroughs. Effort tuning and prompt caching should pull
this meaningfully below that. These are estimates from token arithmetic, not measurements;
re-baseline with `count_tokens` during implementation.

## Hosting

Vercel: static files plus one serverless function at `/api/message`. `ANTHROPIC_API_KEY`
lives in Vercel project environment variables, never in the repo. `server.js` remains for
local development and shares the same handler module, so there is one code path to harden.

### The proxy stops being a proxy

Today `/api/message` forwards the request body to Anthropic verbatim, which is why any site
the user visits can choose the `model` and `max_tokens` and spend the key. The handler
instead accepts `{type: "case" | "interrogate" | "judge", ...}` and **builds** the Anthropic
request server-side. Model, `max_tokens`, effort, and system prompts become server constants
a caller cannot influence. Origin and content-type checks are then defence in depth rather
than the only wall.

### The budget stack, cheapest first

1. Vercel Firewall rate limiting — built in, no dependency, no state to manage. This is the
   only per-IP enforcement; serverless instances are stateless, so an in-memory counter in
   the handler would not hold across instances and must not be relied on.
2. A per-playthrough question ceiling enforced in the handler from the client-supplied
   transcript length — a soft brake on runaway sessions, not a security boundary.
3. A spend cap configured in the Anthropic console — the real backstop.
4. A `GAME_ENABLED` environment flag as a kill switch.

## Security and correctness fixes folded in

These come from the code review of commit `d899b17` and are part of this work, not a separate
pass:

| Location | Issue |
|---|---|
| `server.js` — `/api/message` | Unauthenticated cross-origin use of the API key. Resolved by the build-server-side handler above, plus origin and content-type checks. |
| `server.js` — request handler | Malformed `Host` header throws `ERR_INVALID_URL` and crashes the process. Guard and return 400. |
| `server.js` — body buffering | No size cap; a single large POST exhausts memory. |
| `server.js` — `PORT` parsing | A non-numeric `PORT` throws `ERR_SOCKET_BAD_PORT` past the graceful config-error path. Validate the parsed port. |
| `index.html` — `MAX_TOKENS` | 1000 truncates the case file under adaptive thinking. Covered by the API changes above. |
| `index.html` — `aria-live` | The live region sits on the exact node `render()` replaces, re-announcing the whole page on every reply. Move it to the transcript. |
| `index.html` — retry closure | "Retry Question" reassigns `state.activeSuspect`, silently switching the player back to a suspect they had moved on from. |

## Testing

- **Schema conformance:** every model call returns output matching its declared schema, and
  `stop_reason` is asserted to be `end_turn` rather than `max_tokens`, across several
  generated cases.
- **Case validity:** the murderer matches exactly one suspect name; the real weapon and
  location each appear in their candidate list; forensics eliminate at least one wrong
  candidate each without naming the answer.
- **Integrity:** `caseFile` never appears in the DOM before the game ends; a suspect's request
  payload contains only their own transcript plus, on a confrontation, exactly one foreign
  claim.
- **Proxy hardening:** a cross-origin `text/plain` POST is rejected; an oversized body is
  rejected; a malformed `Host` header returns 400 without killing the process; a
  client-supplied `model` or `max_tokens` is ignored.
- **Playthrough:** a full game reaches a `GUILTY` verdict via confrontation, and a wrong
  accusation names the incorrect element and lets play continue.

## Open questions

None blocking. Two items to resolve empirically during implementation: whether the per-suspect
system prompt clears the 1024-token caching minimum, and the measured (rather than estimated)
cost per playthrough after effort tuning.
