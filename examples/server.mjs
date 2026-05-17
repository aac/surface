#!/usr/bin/env node
// poke reference server — Node.js / stdlib-only.
//
// Implements the HTTP+JSON wire described in references/wire-example.md:
//
//   GET  /               serves the agent-rendered HTML
//   POST /submit         accepts application/json or multipart/form-data
//   GET  /static/<path>  optional static assets relative to the HTML file
//
// On every accepted submission the server:
//   1. appends an entry to `submissions` in the JSON state file (atomic rename
//      with fsync before rename so concurrent readers never see a half-written
//      file)
//   2. emits exactly one line on stdout: `SUBMIT <id> <single-line-payload-json>`
//
// Operational choices (all implementer's call per the references):
//   * stdlib-only, ESM single file
//   * default port 5173, bind 127.0.0.1 (loopback is spec; the rest is taste)
//   * flags --state, --html, --port, --bind (--bind defaults to loopback)
//   * no parent-death watchdog — process lifecycle is the harness's job
//   * Cache-Control: no-store on the served HTML to avoid cached-tab hazards
//     when ports are reused (see references/lifecycle.md)
//   * multipart body cap 64 MiB → 413 Payload Too Large on overflow
//   * unsupported content types on POST /submit → 415 Unsupported Media Type
//   * uploaded files land at `${os.tmpdir()}/poke-uploads/<hex>-<basename>`

import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, rename, open } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, resolve, join, basename, extname, sep } from 'node:path';
import { parseArgs } from 'node:util';
import { Buffer } from 'node:buffer';

// ---------------------------------------------------------------------------
// CLI

function parseCli(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      state: { type: 'string' },
      html: { type: 'string' },
      port: { type: 'string', default: '5173' },
      bind: { type: 'string', default: '127.0.0.1' },
      help: { type: 'boolean', short: 'h', default: false },
    },
    strict: true,
  });
  if (values.help || !values.state || !values.html) {
    return { help: true };
  }
  const port = Number.parseInt(values.port, 10);
  if (!Number.isFinite(port) || port < 0 || port > 65535) {
    throw new Error(`invalid --port: ${values.port}`);
  }
  return {
    statePath: resolve(values.state),
    htmlPath: resolve(values.html),
    port,
    bind: values.bind,
  };
}

const USAGE = `\
poke reference server (Node)

  node examples/server.mjs --state <path> --html <path> [--port <n>] [--bind <addr>]

flags:
  --state   path to the JSON state file (read on GET, mutated on POST /submit)
  --html    path to the agent-rendered HTML to serve at GET /
  --port    TCP port to listen on (default 5173)
  --bind    address to bind (default 127.0.0.1 — loopback only)
`;

// ---------------------------------------------------------------------------
// State file: atomic write + in-process mutex

// Serialise mutating reads so two concurrent submissions can't lose an entry.
let stateChain = Promise.resolve();

function withStateLock(fn) {
  const next = stateChain.then(fn, fn);
  // Swallow rejection on the chain so one failure doesn't poison the lock,
  // but propagate it to the caller.
  stateChain = next.catch(() => {});
  return next;
}

async function appendSubmission(statePath, entry) {
  return withStateLock(async () => {
    const raw = await readFile(statePath, 'utf8');
    const state = JSON.parse(raw);
    if (!Array.isArray(state.submissions)) state.submissions = [];
    state.submissions.push(entry);
    await atomicWriteJSON(statePath, state);
  });
}

async function atomicWriteJSON(path, value) {
  const tmpPath = `${path}.${randomBytes(6).toString('hex')}.tmp`;
  const fh = await open(tmpPath, 'w', 0o600);
  try {
    await fh.writeFile(JSON.stringify(value, null, 2) + '\n', 'utf8');
    await fh.sync(); // fsync before rename — see wire-example.md
  } finally {
    await fh.close();
  }
  await rename(tmpPath, path);
}

// ---------------------------------------------------------------------------
// HTTP

const MULTIPART_BODY_CAP_BYTES = 64 * 1024 * 1024; // 64 MiB
const JSON_BODY_CAP_BYTES = 1 * 1024 * 1024; //  1 MiB — JSON submissions are tiny

function createPokeServer({ statePath, htmlPath, emit = console.log }) {
  const staticRoot = dirname(htmlPath);

  return createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && req.url === '/') {
        return await serveHTML(res, htmlPath);
      }
      if (req.method === 'GET' && req.url.startsWith('/static/')) {
        return await serveStatic(res, staticRoot, req.url);
      }
      if (req.method === 'POST' && req.url === '/submit') {
        return await handleSubmit(req, res, statePath, emit);
      }
      respondText(res, 404, 'not found');
    } catch (err) {
      // Unhandled error path — log and try to respond if headers aren't sent.
      console.error('poke: unhandled request error:', err);
      if (!res.headersSent) respondText(res, 500, 'internal server error');
      else res.end();
    }
  });
}

function respondText(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

async function serveHTML(res, htmlPath) {
  const body = await readFile(htmlPath);
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store, must-revalidate',
  });
  res.end(body);
}

async function serveStatic(res, root, urlPath) {
  // urlPath looks like '/static/foo/bar.css'; resolve relative to the HTML
  // dir and confirm we stayed under it (basic path-traversal guard).
  const rel = decodeURIComponent(urlPath.slice('/static/'.length));
  const target = resolve(root, rel);
  const rootWithSep = root.endsWith(sep) ? root : root + sep;
  if (target !== root && !target.startsWith(rootWithSep)) {
    return respondText(res, 403, 'forbidden');
  }
  try {
    const body = await readFile(target);
    res.writeHead(200, {
      'Content-Type': contentTypeForPath(target),
      'Content-Length': body.length,
    });
    res.end(body);
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'EISDIR') {
      return respondText(res, 404, 'not found');
    }
    throw err;
  }
}

function contentTypeForPath(path) {
  const ext = extname(path).toLowerCase();
  switch (ext) {
    case '.html': return 'text/html; charset=utf-8';
    case '.css':  return 'text/css; charset=utf-8';
    case '.js':   return 'application/javascript; charset=utf-8';
    case '.mjs':  return 'application/javascript; charset=utf-8';
    case '.json': return 'application/json; charset=utf-8';
    case '.svg':  return 'image/svg+xml';
    case '.png':  return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.gif':  return 'image/gif';
    case '.webp': return 'image/webp';
    case '.txt':  return 'text/plain; charset=utf-8';
    default:      return 'application/octet-stream';
  }
}

// ---------------------------------------------------------------------------
// POST /submit

async function handleSubmit(req, res, statePath, emit) {
  const contentType = req.headers['content-type'] || '';
  // Only the media type is case-insensitive per RFC 7231 §3.1.1.1; parameter
  // *values* (notably the multipart boundary) are case-sensitive.
  const mediaType = contentType.split(';', 1)[0].trim().toLowerCase();

  if (mediaType === 'application/json') {
    return handleJSONSubmit(req, res, statePath, emit);
  }
  if (mediaType === 'multipart/form-data') {
    return handleMultipartSubmit(req, res, statePath, emit, contentType);
  }
  return respondText(res, 415, `unsupported content type: ${contentType || '(none)'}`);
}

async function handleJSONSubmit(req, res, statePath, emit) {
  let body;
  try {
    body = await readBody(req, JSON_BODY_CAP_BYTES);
  } catch (err) {
    if (err.code === 'BODY_TOO_LARGE') return respondText(res, 413, 'payload too large');
    throw err;
  }

  let parsed;
  try {
    parsed = JSON.parse(body.toString('utf8'));
  } catch {
    return respondText(res, 400, 'malformed JSON');
  }
  if (parsed === null || typeof parsed !== 'object' || typeof parsed.id !== 'string') {
    return respondText(res, 400, 'submission must be a JSON object with a string id');
  }

  const id = parsed.id;
  // Per wire-example: a missing/undefined payload normalizes to JSON null.
  const payload = 'payload' in parsed ? parsed.payload : null;

  await recordSubmission(statePath, emit, id, payload);
  respondText(res, 200, '');
}

async function handleMultipartSubmit(req, res, statePath, emit, contentType) {
  const boundary = extractBoundary(contentType);
  if (!boundary) return respondText(res, 400, 'multipart: missing or malformed boundary');

  let body;
  try {
    body = await readBody(req, MULTIPART_BODY_CAP_BYTES);
  } catch (err) {
    if (err.code === 'BODY_TOO_LARGE') return respondText(res, 413, 'payload too large');
    throw err;
  }

  let parts;
  try {
    parts = parseMultipart(body, boundary);
  } catch (err) {
    return respondText(res, 400, `multipart: ${err.message}`);
  }

  let id;
  const files = [];
  const otherFields = {};
  for (const part of parts) {
    if (part.filename != null) {
      const storedPath = await storeUpload(part);
      files.push(storedPath);
      continue;
    }
    const name = part.name;
    const value = part.content.toString('utf8');
    if (name === 'id') {
      id = value;
    } else {
      otherFields[name] = value;
    }
  }

  if (typeof id !== 'string' || id.length === 0) {
    return respondText(res, 400, 'multipart: missing id field');
  }

  const payload = { files, ...otherFields };
  await recordSubmission(statePath, emit, id, payload);
  respondText(res, 200, '');
}

async function recordSubmission(statePath, emit, id, payload) {
  const entry = { id, payload, at: new Date().toISOString() };
  await appendSubmission(statePath, entry);
  // Emit exactly one line to stdout. The contract is "split the line on the
  // first two spaces; JSON-parse the remainder" — JSON.stringify produces
  // single-line output for any in-memory value.
  emit(`SUBMIT ${id} ${JSON.stringify(payload)}`);
}

// ---------------------------------------------------------------------------
// Body reading with cap

function readBody(req, capBytes) {
  return new Promise((resolveBody, rejectBody) => {
    const chunks = [];
    let received = 0;
    req.on('data', (chunk) => {
      received += chunk.length;
      if (received > capBytes) {
        const err = new Error('body too large');
        err.code = 'BODY_TOO_LARGE';
        req.destroy();
        rejectBody(err);
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolveBody(Buffer.concat(chunks, received)));
    req.on('error', rejectBody);
  });
}

// ---------------------------------------------------------------------------
// Multipart parser (RFC 7578 / 2046, just what we need)

function extractBoundary(contentType) {
  // Matches: boundary=xxx  or  boundary="xxx"
  const match = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!match) return null;
  return match[1] ?? match[2].trim();
}

function parseMultipart(body, boundary) {
  const delimiter = Buffer.from(`--${boundary}`);
  const parts = [];

  let cursor = body.indexOf(delimiter);
  if (cursor === -1) throw new Error('no boundary delimiter found');

  while (cursor < body.length) {
    cursor += delimiter.length;
    // Either '--' (end of body) or CRLF (start of next part).
    if (body[cursor] === 0x2d && body[cursor + 1] === 0x2d) break;
    if (body[cursor] === 0x0d && body[cursor + 1] === 0x0a) cursor += 2;
    else throw new Error('malformed delimiter');

    // Headers run until a blank line (CRLF CRLF).
    const headerEnd = body.indexOf(Buffer.from('\r\n\r\n'), cursor);
    if (headerEnd === -1) throw new Error('missing part headers');
    const headerBlock = body.slice(cursor, headerEnd).toString('utf8');
    const headers = parsePartHeaders(headerBlock);
    cursor = headerEnd + 4;

    // Content ends at the next delimiter, minus the CRLF before it.
    const nextDelim = body.indexOf(delimiter, cursor);
    if (nextDelim === -1) throw new Error('truncated body, no closing delimiter');
    let contentEnd = nextDelim;
    if (contentEnd >= 2 && body[contentEnd - 2] === 0x0d && body[contentEnd - 1] === 0x0a) {
      contentEnd -= 2;
    }
    const content = body.slice(cursor, contentEnd);

    parts.push({
      name: headers.name,
      filename: headers.filename,
      contentType: headers.contentType,
      content,
    });

    cursor = nextDelim;
  }

  return parts;
}

function parsePartHeaders(block) {
  const headers = { name: undefined, filename: undefined, contentType: undefined };
  for (const line of block.split('\r\n')) {
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (key === 'content-disposition') {
      const name = value.match(/\bname="([^"]*)"/);
      const filename = value.match(/\bfilename="([^"]*)"/);
      if (name) headers.name = name[1];
      if (filename) headers.filename = filename[1];
    } else if (key === 'content-type') {
      headers.contentType = value;
    }
  }
  return headers;
}

// ---------------------------------------------------------------------------
// File storage

async function storeUpload(part) {
  const dir = join(tmpdir(), 'poke-uploads');
  await mkdir(dir, { recursive: true });
  const prefix = randomBytes(8).toString('hex');
  const safeBase = sanitizeFilename(part.filename ?? 'upload');
  const target = join(dir, `${prefix}-${safeBase}`);
  await writeFile(target, part.content, { mode: 0o600 });
  return target;
}

function sanitizeFilename(name) {
  // Strip any path components, replace anything not a typical filename
  // character with '_'. Keep dots so the extension survives. Names that
  // would resolve to '.', '..', '', or '/' fall back to 'upload'.
  if (!name) return 'upload';
  const bare = basename(name.replaceAll('\\', '/'));
  if (!bare || bare === '.' || bare === '..') return 'upload';
  const cleaned = bare.replace(/[^A-Za-z0-9._-]+/g, '_');
  if (!cleaned || cleaned === '.' || cleaned === '..') return 'upload';
  return cleaned;
}

// ---------------------------------------------------------------------------
// Entry point

export { createPokeServer, parseMultipart, extractBoundary, sanitizeFilename, atomicWriteJSON };

function isMain() {
  return import.meta.url === `file://${resolve(process.argv[1] || '')}`;
}

if (isMain()) {
  let cfg;
  try {
    cfg = parseCli(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`poke: ${err.message}\n\n${USAGE}`);
    process.exit(2);
  }
  if (cfg.help) {
    const wantsHelp = process.argv.includes('-h') || process.argv.includes('--help');
    process.stdout.write(USAGE);
    process.exit(wantsHelp ? 0 : 2);
  }

  const server = createPokeServer({
    statePath: cfg.statePath,
    htmlPath: cfg.htmlPath,
  });

  server.listen(cfg.port, cfg.bind, () => {
    const addr = server.address();
    process.stderr.write(`poke: serving ${cfg.htmlPath} on http://${cfg.bind}:${addr.port}/\n`);
  });

  const shutdown = (signal) => {
    process.stderr.write(`poke: received ${signal}, shutting down\n`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}
