# The Interrogation Room

A single-page, LLM-powered procedural whodunnit with a zero-dependency local Node proxy. The browser sends model requests only to the same-origin server, so the Anthropic API key never enters client code.

## Run locally

Requires Node.js 20 or newer and an Anthropic API key. The server loads `.env` automatically; the key remains server-side and is never sent to browser code.

The first time you run the game, create `.env` from the provided template:

```sh
cp .env.example .env
```

Replace the placeholder inside `.env` with your key. Use this format, without `export`:

```dotenv
ANTHROPIC_API_KEY=sk-ant-replace-with-your-key
```

Then start the game with:

```sh
node server.js
```

Open <http://127.0.0.1:3000>.

No package installation or build step is required. `.env` is excluded by `.gitignore`. To use another port, add `PORT=3001` to `.env`.

Optional environment variables:

- `PORT` — defaults to `3000`.
- `HOST` — defaults to `127.0.0.1`.
- `ALLOWED_ORIGINS` — comma-separated origin allowlist for `/api/message`. Leave unset for local development, where any origin is accepted.

Run the test suite with `npm test`. There are no dependencies to install.

## Deploy to Vercel

`api/message.js` is the serverless entry point. It is a thin adapter over the
same `api/handler.js` the local dev server uses, so production and development
cannot drift apart. `server.js` is excluded from the deployment by
`.vercelignore`.

```sh
npx vercel        # link the project and deploy a preview
npx vercel --prod # promote to production
```

Set these in Project → Settings → Environment Variables:

| Name | Value | Environments |
|---|---|---|
| `ANTHROPIC_API_KEY` | your key | Production, Preview |
| `ALLOWED_ORIGINS` | the production URL, e.g. `https://interrogation-room.vercel.app` | Production |
| `GAME_ENABLED` | `true` | Production, Preview |

Leave `ALLOWED_ORIGINS` **unset** on Preview — preview URLs change per
deployment, and an empty allowlist accepts any origin. Setting `GAME_ENABLED`
to `false` is the kill switch: every call returns 503 without reaching
Anthropic.

Verify the key is unspendable from elsewhere:

```sh
curl -s -X POST -H 'Content-Type: application/json' -H 'Origin: https://evil.example' \
  -d '{"type":"case"}' https://<your-production-url>/api/message
```

Expected: `{"error":"Origin not allowed."}` with status 403.

### Spend controls

Rate limiting is **Vercel Firewall only** — add a rule on `/api/message`, e.g.
30 requests per minute per IP. Serverless instances are stateless, so an
in-memory counter in the handler would not hold across them. Set a monthly
spend limit on the key in the Anthropic Console; that is the real backstop,
and everything above it is a filter.

Prompt caching is **enabled for interrogation calls**. The interrogation system
prompt measured 1327 input tokens for a representative case, above the
1024-token minimum cacheable prefix, and it is re-sent verbatim for every
question put to the same suspect in the same tone. The one-shot case and judge
prompts are not marked — they are sent once each per playthrough, so a cache
write would be paid for and never read.
