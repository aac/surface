#!/usr/bin/env node
/**
 * surface — Node.js reference server
 *
 * Implements the HTTP+JSON wire described in references/wire-example.md,
 * derived from references/ and SKILL.md only.
 *
 * Usage:
 *   node server.mjs --state <state.json> --html <page.html> [--port <n>]
 *
 * Routes
 *   GET  /        — serve the agent-rendered HTML page
 *   POST /submit  — accept application/json or multipart/form-data submissions
 *   GET  /static/ — (optional) serve static assets from the same directory as the html file
 *
 * Each accepted submission appends to the state file (atomic rename-write)
 * and emits one line to stdout:
 *   SUBMIT <id> <payload-json>
 *
 * The server exits automatically if its parent process dies (parent-death watchdog).
 */

import { createServer }         from 'node:http';
import { readFileSync, writeFileSync, renameSync, mkdirSync, createWriteStream } from 'node:fs';
import { readFile }             from 'node:fs/promises';
import { createReadStream }     from 'node:fs';
import { open, fsync, close, unlink } from 'node:fs';
import { promisify }            from 'node:util';
import { tmpdir }               from 'node:os';
import { join, dirname, basename, extname } from 'node:path';
import { randomBytes }          from 'node:crypto';
import { Writable }             from 'node:stream';

const fsOpen  = promisify(open);
const fsFsync = promisify(fsync);
const fsClose = promisify(close);
const fsUnlink = promisify(unlink);

// ── CLI args ──────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--state') args.state = argv[++i];
    else if (argv[i] === '--html')  args.html  = argv[++i];
    else if (argv[i] === '--port')  args.port  = parseInt(argv[++i], 10);
  }
  return args;
}

const { state: STATE_PATH, html: HTML_PATH, port: PORT = 5173 } =
  parseArgs(process.argv.slice(2));

if (!STATE_PATH || !HTML_PATH) {
  process.stderr.write('Usage: node server.mjs --state <state.json> --html <page.html> [--port <n>]\n');
  process.exit(1);
}

// ── State file (atomic write under a mutex) ───────────────────────────────────
//
// Schema (from wire-example.md):
//   { session_id, affordances: { <id>: { label, intent } }, submissions: [...] }
//
// Atomic write: write to tmp file → fsync → rename over live path.
// (fsync before rename — more durable than Go ref, which skips fsync.)

let writeLock = Promise.resolve();

function readState() {
  return JSON.parse(readFileSync(STATE_PATH, 'utf8'));
}

async function appendSubmission(entry) {
  // Serialize through a per-process mutex so concurrent requests don't interleave.
  writeLock = writeLock.then(async () => {
    const state = JSON.parse(await readFile(STATE_PATH, 'utf8'));
    state.submissions.push(entry);
    const tmp = STATE_PATH + '.tmp.' + randomBytes(4).toString('hex');
    writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
    // fsync the tmp file for durability, then rename atomically.
    const fd = await fsOpen(tmp, 'r+');
    await fsFsync(fd);
    await fsClose(fd);
    renameSync(tmp, STATE_PATH);
  });
  return writeLock;
}

// ── Multipart parser ──────────────────────────────────────────────────────────
//
// Parses multipart/form-data without external deps.
// Returns { fields: { name: value }, files: [{ fieldname, filename, data: Buffer }] }

function parseContentTypeBoundary(contentType) {
  const m = /boundary=([^\s;]+)/i.exec(contentType);
  return m ? m[1] : null;
}

async function parseMultipart(req, boundary) {
  return new Promise((resolve, reject) => {
    const BODY_LIMIT = 32 * 1024 * 1024; // 32 MiB hard cap (per wire-example.md guidance)
    const chunks = [];
    let size = 0;

    req.on('data', chunk => {
      size += chunk.length;
      if (size > BODY_LIMIT) {
        req.destroy();
        reject(Object.assign(new Error('Payload too large'), { status: 413 }));
        return;
      }
      chunks.push(chunk);
    });

    req.on('error', reject);

    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks);
        const result = splitMultipart(body, boundary);
        resolve(result);
      } catch (e) {
        reject(e);
      }
    });
  });
}

function splitMultipart(body, boundary) {
  const sep = Buffer.from('\r\n--' + boundary);
  const start = Buffer.from('--' + boundary);
  const fields = {};
  const files = [];

  // Find parts between boundaries
  let pos = 0;
  // Skip opening boundary
  const openBound = Buffer.from('--' + boundary + '\r\n');
  if (body.slice(0, openBound.length).equals(openBound)) {
    pos = openBound.length;
  } else {
    throw new Error('Malformed multipart: missing opening boundary');
  }

  while (pos < body.length) {
    // Find the next separator
    const sepIdx = bufferIndexOf(body, sep, pos);
    let partEnd = sepIdx === -1 ? body.length : sepIdx;

    const part = body.slice(pos, partEnd);
    if (part.length === 0) break;

    // Parse headers from this part (headers end at first \r\n\r\n)
    const headerEnd = bufferIndexOf(part, Buffer.from('\r\n\r\n'), 0);
    if (headerEnd === -1) break;

    const headerText = part.slice(0, headerEnd).toString('utf8');
    const partBody = part.slice(headerEnd + 4);

    const disposition = {};
    const cdMatch = /Content-Disposition:\s*form-data;(.+)/i.exec(headerText);
    if (cdMatch) {
      const attrs = cdMatch[1];
      const nameMatch = /\bname="([^"]+)"/.exec(attrs);
      const filenameMatch = /\bfilename="([^"]*)"/.exec(attrs);
      if (nameMatch) disposition.name = nameMatch[1];
      if (filenameMatch) disposition.filename = filenameMatch[1];
    }

    const ctMatch = /Content-Type:\s*([^\r\n]+)/i.exec(headerText);
    const contentType = ctMatch ? ctMatch[1].trim() : null;

    if (disposition.filename !== undefined) {
      // File part
      files.push({
        fieldname: disposition.name,
        filename: disposition.filename,
        data: partBody,
        contentType,
      });
    } else if (disposition.name) {
      // Text field
      // Strip trailing \r\n if present
      let value = partBody;
      if (value.length >= 2 && value[value.length - 2] === 0x0d && value[value.length - 1] === 0x0a) {
        value = value.slice(0, -2);
      }
      fields[disposition.name] = value.toString('utf8');
    }

    if (sepIdx === -1) break;
    pos = sepIdx + sep.length;

    // Check for closing boundary (--) vs continuation (\r\n)
    if (body.slice(pos, pos + 2).toString() === '--') break;
    if (body.slice(pos, pos + 2).toString() === '\r\n') pos += 2;
    else break;
  }

  return { fields, files };
}

function bufferIndexOf(haystack, needle, start = 0) {
  for (let i = start; i <= haystack.length - needle.length; i++) {
    let found = true;
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) { found = false; break; }
    }
    if (found) return i;
  }
  return -1;
}

// ── File upload storage ───────────────────────────────────────────────────────
//
// Writes uploaded files to <tmpdir>/surface-uploads/<random-hex>-<sanitized-basename>

function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 128) || 'upload';
}

function saveUploadedFile(file) {
  const uploadDir = join(tmpdir(), 'surface-uploads');
  mkdirSync(uploadDir, { recursive: true });
  const prefix = randomBytes(8).toString('hex');
  const safe = sanitizeFilename(file.filename || 'upload');
  const dest = join(uploadDir, prefix + '-' + safe);
  writeFileSync(dest, file.data);
  return dest;
}

// ── Body reader ───────────────────────────────────────────────────────────────

async function readBody(req, limit = 1 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > limit) {
        req.destroy();
        reject(Object.assign(new Error('Payload too large'), { status: 413 }));
        return;
      }
      chunks.push(chunk);
    });
    req.on('error', reject);
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

// ── MIME types for static asset serving ──────────────────────────────────────

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.mjs':  'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
};

// ── HTTP server ───────────────────────────────────────────────────────────────

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

  try {
    // GET / — serve the surface HTML
    if (req.method === 'GET' && url.pathname === '/') {
      const html = await readFile(HTML_PATH, 'utf8');
      res.writeHead(200, {
        'Content-Type':  'text/html; charset=utf-8',
        'Cache-Control': 'no-store, must-revalidate',
      });
      res.end(html);
      return;
    }

    // GET /static/<path> — serve static assets co-located with the HTML file
    if (req.method === 'GET' && url.pathname.startsWith('/static/')) {
      const rel = url.pathname.slice('/static/'.length);
      if (!rel || rel.includes('..')) {
        res.writeHead(400); res.end('Bad path'); return;
      }
      const assetPath = join(dirname(HTML_PATH), rel);
      try {
        const data = await readFile(assetPath);
        const mime = MIME[extname(rel).toLowerCase()] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': mime });
        res.end(data);
      } catch {
        res.writeHead(404); res.end('Not found');
      }
      return;
    }

    // POST /submit
    if (req.method === 'POST' && url.pathname === '/submit') {
      const contentType = req.headers['content-type'] || '';

      let affordanceId, payload;

      if (contentType.includes('application/json')) {
        // ── JSON submission ──
        let raw;
        try {
          raw = await readBody(req);
        } catch (e) {
          res.writeHead(e.status || 400); res.end(e.message); return;
        }

        let body;
        try {
          body = JSON.parse(raw.toString('utf8'));
        } catch {
          res.writeHead(400); res.end('Invalid JSON'); return;
        }

        if (typeof body.id !== 'string' || body.id.length === 0) {
          res.writeHead(400); res.end('Missing id'); return;
        }

        affordanceId = body.id;
        // Missing/undefined payload normalizes to null per wire-example.md
        payload = Object.prototype.hasOwnProperty.call(body, 'payload') ? body.payload : null;

      } else if (contentType.includes('multipart/form-data')) {
        // ── Multipart submission (file upload) ──
        const boundary = parseContentTypeBoundary(contentType);
        if (!boundary) {
          res.writeHead(400); res.end('Missing multipart boundary'); return;
        }

        let parsed;
        try {
          parsed = await parseMultipart(req, boundary);
        } catch (e) {
          res.writeHead(e.status || 400); res.end(e.message); return;
        }

        affordanceId = parsed.fields.id;
        if (typeof affordanceId !== 'string' || affordanceId.length === 0) {
          res.writeHead(400); res.end('Missing id field'); return;
        }

        // Save files, collect absolute paths
        const filePaths = parsed.files.map(saveUploadedFile);

        // Construct payload: { files: [...], ...other-fields }
        const otherFields = Object.fromEntries(
          Object.entries(parsed.fields).filter(([k]) => k !== 'id')
        );
        payload = { files: filePaths, ...otherFields };

      } else {
        // All other content types (including application/x-www-form-urlencoded)
        // are intentionally rejected — per wire-example.md.
        res.writeHead(415); res.end('Unsupported Media Type'); return;
      }

      // Append to state file
      const at = new Date().toISOString();
      await appendSubmission({ id: affordanceId, payload, at });

      // Emit SUBMIT line to stdout (single line, payload JSON-serialized)
      const payloadJson = JSON.stringify(payload);
      process.stdout.write(`SUBMIT ${affordanceId} ${payloadJson}\n`);

      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('OK');
      return;
    }

    // Fallthrough
    res.writeHead(404); res.end('Not found');

  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    res.writeHead(500); res.end('Internal error');
  }
});

// ── Start listening ───────────────────────────────────────────────────────────

server.listen(PORT, '127.0.0.1', () => {
  process.stdout.write(`surface server listening on http://127.0.0.1:${PORT}/\n`);
});

// ── Parent-death watchdog ─────────────────────────────────────────────────────
//
// If the parent process exits (kernel reparents us to PID 1), shut down.
// Checks every 2 seconds. Catches the common case where the agent's shell
// exits but the node child lingers holding the port.

const parentPid = process.ppid;
setInterval(() => {
  try {
    process.kill(parentPid, 0); // signal 0 = existence check, no signal sent
  } catch {
    // Parent is gone
    process.stderr.write('Parent process exited; shutting down surface server.\n');
    server.close(() => process.exit(0));
  }
}, 2000).unref(); // unref so this timer doesn't prevent normal exit
