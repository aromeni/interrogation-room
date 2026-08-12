import { handleMessage, isAllowedOrigin, assertPostable } from "./handler.js";
import { ValidationError } from "./validate.js";

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
  .split(",").map(value => value.trim()).filter(Boolean);

export default async function handler(request, response) {
  if (process.env.GAME_ENABLED === "false") {
    response.status(503).json({ error: "The department is closed for the night." });
    return;
  }
  if (request.method !== "POST") {
    response.status(405).json({ error: "Method not allowed." });
    return;
  }
  try {
    if (!isAllowedOrigin(request.headers.origin, ALLOWED_ORIGINS)) {
      response.status(403).json({ error: "Origin not allowed." });
      return;
    }
    assertPostable(request.headers);
    // Vercel parses application/json bodies for us.
    const result = await handleMessage(request.body, {
      apiKey: process.env.ANTHROPIC_API_KEY
    });
    response.status(result.status).json(result.json);
  } catch (error) {
    const status = error instanceof ValidationError ? error.status : 400;
    response.status(status).json({ error: error.message || "Bad request." });
  }
}
