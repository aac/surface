#!/usr/bin/env node
// poke reference server — Node sibling of examples/server.go and
// examples/server.py.
//
// Implements the HTTP+JSON wire described in references/wire-example.md.
// Node stdlib only (`node:http`, `node:fs`, `node:crypto`, `node:path`,
// `node:os`, `node:url`, `node:buffer`). No Express, no busboy, no
// third-party deps — kept stdlib-only to match the substrate-comparison
// stance of the Go and Python references.
//
// Usage:
//
//     node examples/server.mjs --state /tmp/poke-state.json \
//         --html /tmp/poke.html [--port 5173] [--bind 127.0.0.1]
//
// One canonical wire for localhost use. Loopback bind by default. Emits one
// line per submission to stdout:
//
//     SUBMIT <id> <payload-json>
//
// The wire contract is locked in docs/plan.md "Shared contracts" and mirrored
// by examples/server.go and examples/server.py.
//
// File extension: `.mjs` so Node treats this single file as ESM regardless
// of any package.json in an ancestor directory — there is none in this repo
// today, and we don't want to add one for one example file.

import { createServer } from 'node:http';
import { readFile, writeFile, rename, mkdir, open, unlink } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { basename, dirname, join, resolve as resolvePath } from 'node:path';
import { tmpdir } from 'node:os';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Cap multipart bodies at 32 MiB — matches the Go and Python references.
const MAX_MULTIPART_BYTES = 32 << 20;

// Path layout for stored uploads:
//   <tmpdir>/poke-uploads/<random-hex>-<sanitized-basename>
const UPLOAD_SUBDIR = 'poke-uploads';

// Watchdog poll cadence (ms). Mirrors the Go and Python references.
const PARENT_POLL_INTERVAL_MS = 500;

// ---------------------------------------------------------------------------
// State file helpers (atomic write + serialized record)
// ---------------------------------------------------------------------------

// Single-promise mutex: every record() call awaits the previous one. Node
// is single-threaded, but the read-modify-write of the state file plus the
// drain-side emission still needs serialization so concurrent in-flight
// requests don't interleave their state mutations. Mirrors the Go reference's
// sync.Mutex and the Python sibling's threading.Lock.
let _stateChain = Promise.resolve();

function _serializeStateMutation(fn) {
  const next = _stateChain.then(fn, fn);
  // Swallow rejection on the chain so one failed write doesn't poison
  // every subsequent caller; the caller still receives its own rejection
  // via the returned promise.
  _stateChain = next.catch(() => {});
  return next;
}

async function _atomicWrite(path, data) {
  // Same shape as the Go/Python references: write to a sibling temp file
  // (same directory so rename is atomic on POSIX), then rename. On failure
  // we best-effort unlink the tmp file rather than leak partial state.
  const dir = dirname(resolvePath(path));
  const tmpName = join(dir, `.poke-state-${randomBytes(4).toString('hex')}.tmp`);
  let handle;
  try {
    handle = await open(tmpName, 'w');
    await handle.writeFile(data);
    // fsync before rename — the rename is atomic in metadata terms but
    // without a sync we could rename a file whose bytes haven't hit disk
    // yet, visible after a crash. Python reference does the same with
    // os.fsync().
    await handle.sync();
    await handle.close();
    handle = null;
    await rename(tmpName, path);
  } catch (err) {
    if (handle) {
      try { await handle.close(); } catch { /* ignore */ }
    }
    try { await unlink(tmpName); } catch { /* ignore */ }
    throw err;
  }
}

function _nowRfc3339() {
  // RFC3339-shaped UTC timestamp with millisecond precision. Node's Date
  // tops out at milliseconds — coarser than Go's nanoseconds and Python's
  // microseconds. Consumers parse with a date library rather than lex on
  // digit count, so this is fine per the shared contract's documented
  // "RFC3339-shaped" stance (see server.py _now_rfc3339).
  return new Date().toISOString();
}

async function _record(statePath, affordanceId, payload, stdoutWrite) {
  return _serializeStateMutation(async () => {
    const raw = await readFile(statePath, 'utf-8');
    const state = JSON.parse(raw);

    // Defensive: missing `submissions` key — schema requires it, but we
    // shouldn't crash on a hand-edited state file.
    if (!Array.isArray(state.submissions)) {
      state.submissions = [];
    }
    state.submissions.push({
      id: affordanceId,
      payload,
      at: _nowRfc3339(),
    });

    // Compact encoding: matches Go's json.Marshal (no whitespace) and
    // Python's json.dumps(..., separators=(",", ":")).
    const encoded = Buffer.from(JSON.stringify(state), 'utf-8');
    await _atomicWrite(statePath, encoded);

    // Per the shared contract: `SUBMIT <id> <payload-json>` on stdout,
    // payload re-serialized compactly on one line. Default writer is
    // process.stdout.write; tests inject a buffer-collecting alternative.
    const payloadJson = JSON.stringify(payload);
    const line = `SUBMIT ${affordanceId} ${payloadJson}\n`;
    stdoutWrite(line);
  });
}

// ---------------------------------------------------------------------------
// Multipart parsing (stdlib-only, hand-rolled)
// ---------------------------------------------------------------------------
//
// Node stdlib has no multipart parser. Pulling busboy would be small and
// ergonomic, but the whole point of these reference implementations is
// exercising the substrate-agnostic claim head-on — staying stdlib-only
// keeps the comparison clean.
//
// The parser supports well-formed multipart/form-data bodies as produced
// by browsers and by the test fixture. It doesn't try to handle every
// pathological case (preamble/epilogue with embedded boundary markers,
// folded headers, RFC 2231 extended encoding, transfer-encodings) — same
// scope as the Go and Python references.

function _extractBoundary(contentType) {
  // Content-Type: multipart/form-data; boundary=----foo
  // Boundary value may be quoted. Case-insensitive on the parameter name
  // per RFC 2046.
  const match = /;\s*boundary=(?:"([^"]+)"|([^\s;]+))/i.exec(contentType);
  if (!match) return null;
  return match[1] ?? match[2];
}

function _parseMultipart(contentType, body) {
  const boundary = _extractBoundary(contentType);
  if (!boundary) {
    throw new Error('multipart boundary missing');
  }
  const delim = Buffer.from(`--${boundary}`);
  const fields = {};
  const files = [];

  // Walk the body, splitting on `--<boundary>` markers. Each part is a
  // header block (CRLF-terminated lines, ended by blank CRLF) followed by
  // body bytes up to the next boundary. Trailing `--` after the last
  // boundary marks end-of-multipart.
  let cursor = body.indexOf(delim);
  if (cursor < 0) {
    throw new Error('multipart: no opening boundary');
  }

  while (cursor >= 0) {
    const partStart = cursor + delim.length;
    // After the boundary marker we expect either CRLF (more parts) or
    // `--` followed by CRLF (end-of-multipart).
    if (
      body[partStart] === 0x2d /* '-' */ &&
      body[partStart + 1] === 0x2d
    ) {
      break;
    }
    // Skip the CRLF (or LF, tolerant) following the boundary.
    let bodyStart = partStart;
    if (body[bodyStart] === 0x0d && body[bodyStart + 1] === 0x0a) {
      bodyStart += 2;
    } else if (body[bodyStart] === 0x0a) {
      bodyStart += 1;
    }

    const nextBoundary = body.indexOf(delim, bodyStart);
    if (nextBoundary < 0) {
      throw new Error('multipart: unterminated part');
    }

    // Strip the trailing CRLF that precedes the next boundary marker.
    let partEnd = nextBoundary;
    if (body[partEnd - 2] === 0x0d && body[partEnd - 1] === 0x0a) {
      partEnd -= 2;
    } else if (body[partEnd - 1] === 0x0a) {
      partEnd -= 1;
    }

    // Split headers from body on the first blank line (CRLFCRLF).
    const headerEndCRLF = body.indexOf(Buffer.from('\r\n\r\n'), bodyStart);
    let headerEnd;
    let dataStart;
    if (headerEndCRLF >= 0 && headerEndCRLF < partEnd) {
      headerEnd = headerEndCRLF;
      dataStart = headerEndCRLF + 4;
    } else {
      // Tolerant fallback: LFLF.
      const headerEndLF = body.indexOf(Buffer.from('\n\n'), bodyStart);
      if (headerEndLF < 0 || headerEndLF >= partEnd) {
        throw new Error('multipart: part missing header/body separator');
      }
      headerEnd = headerEndLF;
      dataStart = headerEndLF + 2;
    }

    const headerBlock = body.slice(bodyStart, headerEnd).toString('utf-8');
    const partData = body.slice(dataStart, partEnd);

    const headers = _parseHeaderBlock(headerBlock);
    const disposition = headers['content-disposition'] ?? '';
    const params = _parseContentDisposition(disposition);
    const name = params.name;
    if (!name) {
      // Unnamed part — skip (matches Python reference behavior).
      cursor = nextBoundary;
      continue;
    }
    if (params.filename !== undefined) {
      files.push({ fieldName: name, filename: params.filename, data: partData });
    } else {
      // Text field. Decode as UTF-8; multipart text fields don't typically
      // declare a charset for form posts, and the Go reference assumes
      // the same.
      fields[name] = partData.toString('utf-8');
    }

    cursor = nextBoundary;
  }

  return { fields, files };
}

function _parseHeaderBlock(block) {
  const out = {};
  for (const line of block.split(/\r?\n/)) {
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    out[key] = value;
  }
  return out;
}

function _parseContentDisposition(header) {
  // Tiny Content-Disposition parser yielding {name, filename}. Sufficient
  // for well-formed multipart/form-data; doesn't handle RFC 2231 extended
  // encoding (rare in form posts; Go and Python references don't either).
  const out = {};
  if (!header) return out;
  const parts = [];
  let buf = '';
  let inQuotes = false;
  for (const ch of header) {
    if (ch === '"') {
      inQuotes = !inQuotes;
      buf += ch;
    } else if (ch === ';' && !inQuotes) {
      parts.push(buf.trim());
      buf = '';
    } else {
      buf += ch;
    }
  }
  if (buf) parts.push(buf.trim());

  for (const p of parts) {
    const eq = p.indexOf('=');
    if (eq < 0) continue;
    const key = p.slice(0, eq).trim().toLowerCase();
    let value = p.slice(eq + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

async function _saveUpload(uploadDir, filename, data) {
  // Path shape matches the Go and Python references:
  //   <tmpdir>/poke-uploads/<random-hex>-<sanitized-basename>
  await mkdir(uploadDir, { recursive: true });
  const safe = _sanitizeFilename(filename);
  // randomBytes(8) -> 16 hex chars; matches crypto/rand 8 bytes in the Go
  // reference and secrets.token_hex(8) in the Python sibling.
  const name = `${randomBytes(8).toString('hex')}-${safe}`;
  const full = resolvePath(join(uploadDir, name));
  await writeFile(full, data);
  return full;
}

function _sanitizeFilename(name) {
  const b = basename(name ?? '');
  if (!b || b === '.' || b === '/' || b === '\\') {
    return 'upload';
  }
  return b;
}

// ---------------------------------------------------------------------------
// HTTP handlers
// ---------------------------------------------------------------------------

// Collect the entire request body into a Buffer, with a cap. The cap
// protects against unbounded memory use from a runaway client; breached
// caps return 413 to the caller.
function _readRequestBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        req.removeAllListeners('data');
        req.removeAllListeners('end');
        const err = new Error('body too large');
        err.statusCode = 413;
        reject(err);
        req.resume();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks, total)));
    req.on('error', reject);
  });
}

export function buildServer({ statePath, htmlPath, stdoutWrite = (s) => process.stdout.write(s) } = {}) {
  if (!statePath || !htmlPath) {
    throw new Error('buildServer requires statePath and htmlPath');
  }
  const server = createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && req.url === '/') {
        await _serveHtml(htmlPath, res);
      } else if (req.method === 'POST' && req.url === '/submit') {
        await _submit(req, res, statePath, stdoutWrite);
      } else {
        _sendText(res, 404, 'not found');
      }
    } catch (err) {
      // Last-ditch catch — handler-level errors otherwise hang the
      // request. Surface a 500 with the message; the client doesn't see
      // this for SUBMIT-line drains but it helps debugging.
      _sendText(res, 500, `server error: ${err?.message ?? String(err)}`);
    }
  });
  return server;
}

async function _serveHtml(htmlPath, res) {
  let body;
  try {
    body = await readFile(htmlPath);
  } catch (err) {
    _sendText(res, 500, `read html: ${err.message}`);
    return;
  }
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': body.length,
    // Mirrors the Go and Python references: guards against the
    // stale-tab-on-reused-port footgun.
    'Cache-Control': 'no-store, must-revalidate',
  });
  res.end(body);
}

async function _submit(req, res, statePath, stdoutWrite) {
  const ctype = req.headers['content-type'] ?? '';
  const base = ctype.split(';', 1)[0].trim().toLowerCase();

  if (base === 'application/json') {
    let body;
    try {
      body = await _readRequestBody(req, MAX_MULTIPART_BYTES);
    } catch (err) {
      _sendText(res, err.statusCode ?? 400, err.message);
      return;
    }
    await _submitJson(body, res, statePath, stdoutWrite);
  } else if (base === 'multipart/form-data') {
    let body;
    try {
      body = await _readRequestBody(req, MAX_MULTIPART_BYTES);
    } catch (err) {
      _sendText(res, err.statusCode ?? 400, err.message);
      return;
    }
    await _submitMultipart(ctype, body, res, statePath, stdoutWrite);
  } else {
    _sendText(res, 415, 'unsupported content type');
  }
}

async function _submitJson(body, res, statePath, stdoutWrite) {
  let parsed;
  try {
    parsed = body.length === 0 ? {} : JSON.parse(body.toString('utf-8'));
  } catch (err) {
    _sendText(res, 400, `invalid json: ${err.message}`);
    return;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    _sendText(res, 400, 'json body must be object');
    return;
  }
  const affordanceId = parsed.id;
  if (typeof affordanceId !== 'string' || affordanceId.length === 0) {
    _sendText(res, 400, 'missing id');
    return;
  }
  // `payload` missing or undefined both collapse to JSON null — matches
  // the Go reference's RawMessage("null") fallback and the Python
  // reference's parsed.get("payload", None).
  const payload = parsed.payload === undefined ? null : parsed.payload;

  try {
    await _record(statePath, affordanceId, payload, stdoutWrite);
  } catch (err) {
    _sendText(res, 500, `record: ${err.message}`);
    return;
  }
  res.writeHead(200, { 'Content-Length': 0 });
  res.end();
}

async function _submitMultipart(contentType, body, res, statePath, stdoutWrite) {
  let parsed;
  try {
    parsed = _parseMultipart(contentType, body);
  } catch (err) {
    _sendText(res, 400, `invalid multipart: ${err.message}`);
    return;
  }
  const { fields, files } = parsed;
  const affordanceId = fields.id ?? '';
  if (!affordanceId) {
    _sendText(res, 400, 'missing id');
    return;
  }

  const uploadDir = join(tmpdir(), UPLOAD_SUBDIR);
  const savedPaths = [];
  for (const f of files) {
    try {
      savedPaths.push(await _saveUpload(uploadDir, f.filename, f.data));
    } catch (err) {
      _sendText(res, 500, `save upload: ${err.message}`);
      return;
    }
  }

  // Build payload: files always present (empty array when no files — not
  // null — matching the Go reference's act-0cd3 fix and the Python
  // sibling's behavior). Other text form fields ride through as keys.
  const payload = { files: savedPaths };
  for (const [name, value] of Object.entries(fields)) {
    if (name === 'id') continue;
    payload[name] = value;
  }

  try {
    await _record(statePath, affordanceId, payload, stdoutWrite);
  } catch (err) {
    _sendText(res, 500, `record: ${err.message}`);
    return;
  }
  res.writeHead(200, { 'Content-Length': 0 });
  res.end();
}

function _sendText(res, status, message) {
  const body = Buffer.from(message ?? '', 'utf-8');
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': body.length,
  });
  res.end(body);
}

// ---------------------------------------------------------------------------
// Parent-death watchdog
// ---------------------------------------------------------------------------
//
// Mirrors the Go and Python references. When the original parent exits,
// the OS reparents us — on POSIX, ppid becomes 1. Polling lets us detect
// that and shut down the server rather than holding the port across
// sessions. Skips the loop when the original ppid is <= 1 (launched
// directly by init — rare; nothing useful to watch).

export function watchParentDeath(server, originalPpid, tickMs = PARENT_POLL_INTERVAL_MS) {
  if (originalPpid <= 1) {
    return { stop: () => {} };
  }
  const interval = setInterval(() => {
    if (process.ppid !== originalPpid) {
      process.stderr.write('poke: parent process exited; shutting down\n');
      clearInterval(interval);
      server.close();
    }
  }, tickMs);
  // Don't keep the event loop alive solely for the watchdog.
  interval.unref();
  return { stop: () => clearInterval(interval) };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function _parseArgs(argv) {
  // Tiny --flag value parser — stdlib's util.parseArgs would also work
  // but adds dependency on a relatively recent Node API surface. Keep it
  // small and matched to the Go/Python references' flag set.
  const out = { port: 5173, bind: '127.0.0.1' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--state') { out.state = argv[++i]; }
    else if (a === '--html') { out.html = argv[++i]; }
    else if (a === '--port') { out.port = Number(argv[++i]); }
    else if (a === '--bind') { out.bind = argv[++i]; }
    else if (a === '--help' || a === '-h') { out.help = true; }
    else { throw new Error(`unknown flag: ${a}`); }
  }
  return out;
}

function _usage() {
  return 'usage: server.mjs --state <path> --html <path> [--port N] [--bind addr]';
}

export async function main(argv = process.argv.slice(2)) {
  let args;
  try {
    args = _parseArgs(argv);
  } catch (err) {
    process.stderr.write(`poke: ${err.message}\n${_usage()}\n`);
    return 2;
  }
  if (args.help || !args.state || !args.html) {
    process.stderr.write(`${_usage()}\n`);
    return args.help ? 0 : 2;
  }
  if (!Number.isFinite(args.port) || args.port < 0 || args.port > 65535) {
    process.stderr.write(`poke: invalid --port\n${_usage()}\n`);
    return 2;
  }

  const server = buildServer({ statePath: args.state, htmlPath: args.html });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(args.port, args.bind, () => {
      server.off('error', reject);
      process.stderr.write(
        `poke: serving ${args.html} on http://${args.bind}:${args.port}/ ` +
        `(state=${args.state})\n`
      );
      resolve();
    });
  });

  const watchdog = watchParentDeath(server, process.ppid);

  // Graceful shutdown on SIGINT/SIGTERM; matches the spirit of the Go
  // reference's http.Server.Shutdown signal handling.
  const shutdown = () => {
    watchdog.stop();
    server.close();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return new Promise((resolve) => {
    server.on('close', () => resolve(0));
  });
}

// CLI entry — only run main when invoked directly, not when imported by
// tests. import.meta.url comparison is the canonical ESM idiom.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolvePath(process.argv[1])) {
  main().then(
    (code) => process.exit(code ?? 0),
    (err) => {
      process.stderr.write(`poke: fatal: ${err?.stack ?? err}\n`);
      process.exit(1);
    },
  );
}
