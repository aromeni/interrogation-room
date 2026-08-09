# The Interrogation Room

A single-page, LLM-powered procedural whodunnit with a zero-dependency local Node proxy. The browser sends model requests only to the same-origin server, so the Anthropic API key never enters client code.

## Run locally

Requires Node.js 18 or newer and an Anthropic API key. The server loads `.env` automatically; the key remains server-side and is never sent to browser code.

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
