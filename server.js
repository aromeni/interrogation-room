'use strict';

const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');

function loadEnvFile(filePath) {
  let source;
  try {
    source = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }

  source.split(/\r?\n/).forEach((line, index) => {
    let entry = line.trim();
    if (!entry || entry.startsWith('#')) return;
    if (entry.startsWith('export ')) entry = entry.slice(7).trimStart();

    const separator = entry.indexOf('=');
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

try {
  loadEnvFile(path.join(__dirname, '.env'));
} catch (error) {
  console.error(`Configuration error: ${error.message}`);
  process.exit(1);
}

const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number.parseInt(process.env.PORT || '3000', 10);
const INDEX_PATH = path.join(__dirname, 'index.html');

function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store'
  });
  response.end(body);
}

function serveIndex(request, response) {
  fs.readFile(INDEX_PATH, (error, html) => {
    if (error) {
      sendJson(response, 500, { error: 'Could not read index.html.' });
      return;
    }
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'content-length': html.length,
      'cache-control': 'no-store'
    });
    if (request.method === 'HEAD') response.end();
    else response.end(html);
  });
}

function proxyMessage(request, response) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    sendJson(response, 500, { error: 'ANTHROPIC_API_KEY is not set on the server.' });
    return;
  }

  const chunks = [];
  request.on('data', chunk => chunks.push(chunk));
  request.on('error', () => {
    if (!response.headersSent) sendJson(response, 400, { error: 'Could not read request body.' });
  });
  request.on('end', () => {
    const body = Buffer.concat(chunks);
    const upstream = https.request({
      hostname: 'api.anthropic.com',
      port: 443,
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'content-length': body.length
      }
    }, upstreamResponse => {
      const responseHeaders = {
        'content-type': upstreamResponse.headers['content-type'] || 'application/json; charset=utf-8',
        'cache-control': 'no-store'
      };
      response.writeHead(upstreamResponse.statusCode || 502, responseHeaders);
      upstreamResponse.pipe(response);
    });

    upstream.setTimeout(120000, () => upstream.destroy(new Error('Upstream request timed out.')));
    upstream.on('error', () => {
      if (!response.headersSent) sendJson(response, 502, { error: 'The Anthropic API could not be reached.' });
      else response.end();
    });
    upstream.end(body);
  });
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || `${HOST}:${PORT}`}`);

  if ((request.method === 'GET' || request.method === 'HEAD') && (url.pathname === '/' || url.pathname === '/index.html')) {
    serveIndex(request, response);
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/message') {
    proxyMessage(request, response);
    return;
  }

  if (request.method === 'GET' && url.pathname === '/favicon.ico') {
    response.writeHead(204);
    response.end();
    return;
  }

  sendJson(response, 404, { error: 'Not found.' });
});

server.on('error', error => {
  console.error(`Server failed: ${error.message}`);
  process.exitCode = 1;
});

server.listen(PORT, HOST, () => {
  console.log(`The Interrogation Room is open at http://${HOST}:${PORT}`);
});
