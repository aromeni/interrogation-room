import http from "node:http";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parsePort, ValidationError } from "./api/validate.js";
import { handleMessage, isAllowedOrigin, assertPostable, MAX_BODY_BYTES } from "./api/handler.js";

const ROOT = path.dirname(fileURLToPath(import.meta.url));

function loadEnvFile(filePath) {
  let source;
  try {
    source = fs.readFileSync(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  source.split(/\r?\n/).forEach((line, index) => {
    let entry = line.trim();
    if (!entry || entry.startsWith("#")) return;
    if (entry.startsWith("export ")) entry = entry.slice(7).trimStart();
    const separator = entry.indexOf("=");
    if (separator < 1) throw new Error(`Invalid .env entry on line ${index + 1}.`);
    const name = entry.slice(0, separator).trim();
    let value = entry.slice(separator + 1).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      throw new Error(`Invalid variable name in .env on line ${index + 1}.`);
    }
    if (value.startsWith('"') || value.startsWith("'")) {
      const quote = value[0];
      if (value.length < 2 || !value.endsWith(quote)) {
        throw new Error(`Invalid quoted value for ${name} in .env.`);
      }
      value = value.slice(1, -1);
    }
    if (process.env[name] === undefined) process.env[name] = value;
  });
}

let PORT;
try {
  loadEnvFile(path.join(ROOT, ".env"));
  PORT = parsePort(process.env.PORT);
} catch (error) {
  console.error(`Configuration error: ${error.message}`);
  process.exit(1);
}

const HOST = process.env.HOST || "127.0.0.1";
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
  .split(",").map(value => value.trim()).filter(Boolean);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8"
};

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store"
  });
  response.end(body);
}

async function readBody(request) {
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    // Enforced against actual bytes, not just the declared Content-Length,
    // so a lying header cannot exhaust memory.
    if (total > MAX_BODY_BYTES) throw new ValidationError("Request body is too large.", 413);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function serveStatic(pathname, response) {
  const relative = pathname === "/" ? "index.html" : pathname.slice(1);
  const target = path.join(ROOT, relative);
  // Confine every read to the repo root, rejecting ../ traversal.
  if (!target.startsWith(ROOT + path.sep)) {
    sendJson(response, 403, { error: "Forbidden." });
    return;
  }
  const extension = path.extname(target);
  if (!MIME[extension]) {
    sendJson(response, 404, { error: "Not found." });
    return;
  }
  try {
    const file = await fsp.readFile(target);
    response.writeHead(200, { "content-type": MIME[extension], "cache-control": "no-store" });
    response.end(file);
  } catch {
    sendJson(response, 404, { error: "Not found." });
  }
}

const server = http.createServer(async (request, response) => {
  let url;
  try {
    // A malformed Host header throws ERR_INVALID_URL, which server.on("error")
    // does not catch. Guarding here keeps the process alive.
    url = new URL(request.url, `http://${request.headers.host || `${HOST}:${PORT}`}`);
  } catch {
    sendJson(response, 400, { error: "Malformed request URL." });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/message") {
    try {
      if (!isAllowedOrigin(request.headers.origin, ALLOWED_ORIGINS)) {
        sendJson(response, 403, { error: "Origin not allowed." });
        return;
      }
      assertPostable(request.headers);
      const raw = await readBody(request);
      const result = await handleMessage(JSON.parse(raw), {
        apiKey: process.env.ANTHROPIC_API_KEY
      });
      sendJson(response, result.status, result.json);
    } catch (error) {
      const status = error instanceof ValidationError ? error.status : 400;
      sendJson(response, status, { error: error.message || "Bad request." });
    }
    return;
  }

  if (request.method === "GET" || request.method === "HEAD") {
    if (url.pathname === "/favicon.ico") {
      response.writeHead(204);
      response.end();
      return;
    }
    await serveStatic(url.pathname, response);
    return;
  }

  sendJson(response, 404, { error: "Not found." });
});

server.on("error", error => {
  console.error(`Server failed: ${error.message}`);
  process.exitCode = 1;
});

server.listen(PORT, HOST, () => {
  console.log(`The Interrogation Room is open at http://${HOST}:${PORT}`);
});
