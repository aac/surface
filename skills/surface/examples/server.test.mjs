/**
 * surface Node.js reference server — wire envelope test suite
 *
 * Tests the wire envelope defined in references/wire-example.md:
 *   - GET / serves HTML with no-store cache header
 *   - POST /submit application/json — appends submission, emits SUBMIT line
 *   - POST /submit multipart/form-data — stores files, emits SUBMIT line
 *   - application/x-www-form-urlencoded → 415
 *   - Missing id → 400
 *   - Missing/undefined payload normalizes to null
 *   - State file schema: { session_id, affordances, submissions[] }
 *   - SUBMIT line format: "SUBMIT <id> <payload-json>"
 *   - Submission at field is RFC3339
 */

import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { writeFileSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir, EOL } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const SERVER_MJS = join(__dirname, 'server.mjs');

// ── Test harness ──────────────────────────────────────────────────────────────

/** Spawns the server; returns { proc, port, stateFile, tmpDir, stdoutLines, htmlFile } */
function spawnServer(affordances = {}) {
  const tmpDir   = mkdtempSync(join(tmpdir(), 'surface-test-'));
  const stateFile = join(tmpDir, 'state.json');
  const htmlFile  = join(tmpDir, 'page.html');
  const port      = 15173 + Math.floor(Math.random() * 1000);

  const sessionId = 'test-' + randomBytes(4).toString('hex');
  const state = { session_id: sessionId, affordances, submissions: [] };
  writeFileSync(stateFile, JSON.stringify(state, null, 2));
  writeFileSync(htmlFile, '<!doctype html><html><body>test surface</body></html>');

  const stdoutLines = [];
  const proc = spawn(process.execPath, [SERVER_MJS, '--state', stateFile, '--html', htmlFile, '--port', String(port)]);
  proc.stdout.on('data', data => {
    data.toString().split('\n').filter(Boolean).forEach(l => stdoutLines.push(l));
  });
  proc.stderr.on('data', () => {}); // suppress

  return { proc, port, stateFile, tmpDir, stdoutLines, htmlFile };
}

/** Waits until the server is accepting connections (polls GET /) */
async function waitReady(port, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await httpGet(port, '/');
      return;
    } catch {
      await new Promise(r => setTimeout(r, 50));
    }
  }
  throw new Error(`Server on port ${port} did not become ready in ${timeoutMs}ms`);
}

function teardown({ proc, tmpDir }) {
  proc.kill();
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function httpGet(port, path) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject);
  });
}

function httpPost(port, path, contentType, body) {
  return new Promise((resolve, reject) => {
    const bodyBuf = typeof body === 'string' ? Buffer.from(body) : body;
    const req = http.request(
      { host: '127.0.0.1', port, path, method: 'POST',
        headers: { 'Content-Type': contentType, 'Content-Length': bodyBuf.length } },
      res => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
      }
    );
    req.on('error', reject);
    req.write(bodyBuf);
    req.end();
  });
}

/** Build a minimal multipart/form-data body */
function buildMultipart(boundary, parts) {
  const CRLF = '\r\n';
  let buf = Buffer.alloc(0);
  for (const part of parts) {
    let header = `--${boundary}${CRLF}`;
    if (part.filename) {
      header += `Content-Disposition: form-data; name="${part.name}"; filename="${part.filename}"${CRLF}`;
      if (part.contentType) header += `Content-Type: ${part.contentType}${CRLF}`;
    } else {
      header += `Content-Disposition: form-data; name="${part.name}"${CRLF}`;
    }
    header += CRLF;
    const headerBuf = Buffer.from(header);
    const bodyBuf   = typeof part.data === 'string' ? Buffer.from(part.data) : part.data;
    const sep       = Buffer.from(CRLF);
    buf = Buffer.concat([buf, headerBuf, bodyBuf, sep]);
  }
  buf = Buffer.concat([buf, Buffer.from(`--${boundary}--${CRLF}`)]);
  return buf;
}

/** Wait until stdoutLines contains at least one SUBMIT line */
async function waitForSubmit(stdoutLines, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const line = stdoutLines.find(l => l.startsWith('SUBMIT '));
    if (line) return line;
    await new Promise(r => setTimeout(r, 30));
  }
  throw new Error('No SUBMIT line appeared on stdout within timeout');
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /', () => {
  let ctx;
  before(async () => {
    ctx = spawnServer();
    await waitReady(ctx.port);
  });
  after(() => teardown(ctx));

  test('returns 200 with HTML content type', async () => {
    const res = await httpGet(ctx.port, '/');
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /text\/html/);
  });

  test('returns Cache-Control: no-store', async () => {
    const res = await httpGet(ctx.port, '/');
    assert.ok(
      res.headers['cache-control'] &&
      res.headers['cache-control'].includes('no-store'),
      `expected no-store in cache-control, got: ${res.headers['cache-control']}`
    );
  });

  test('body contains agent-rendered HTML', async () => {
    const res = await httpGet(ctx.port, '/');
    assert.match(res.body, /test surface/);
  });
});

describe('POST /submit — application/json', () => {
  const AFFORDANCE_ID = 'aff-' + randomBytes(4).toString('hex');
  let ctx;

  before(async () => {
    ctx = spawnServer({
      [AFFORDANCE_ID]: { label: 'Approve', intent: 'approve_pr_99' },
    });
    await waitReady(ctx.port);
  });
  after(() => teardown(ctx));

  test('returns 200 on valid submission', async () => {
    const res = await httpPost(ctx.port, '/submit', 'application/json',
      JSON.stringify({ id: AFFORDANCE_ID, payload: { answer: 'yes' } }));
    assert.equal(res.status, 200);
  });

  test('emits SUBMIT line: "SUBMIT <id> <payload-json>"', async () => {
    const line = await waitForSubmit(ctx.stdoutLines);
    // Parse per wire contract: split on first two spaces
    const parts = line.split(' ');
    assert.equal(parts[0], 'SUBMIT');
    assert.equal(parts[1], AFFORDANCE_ID);
    const payloadJson = parts.slice(2).join(' ');
    const payload = JSON.parse(payloadJson);   // must be valid JSON
    assert.deepEqual(payload, { answer: 'yes' });
  });

  test('state file accumulates submission with correct schema', () => {
    const state = JSON.parse(readFileSync(ctx.stateFile, 'utf8'));
    assert.ok(state.session_id, 'session_id present');
    assert.ok(state.affordances, 'affordances present');
    assert.ok(Array.isArray(state.submissions), 'submissions is array');
    assert.ok(state.submissions.length >= 1, 'at least one submission');

    const sub = state.submissions.find(s => s.id === AFFORDANCE_ID);
    assert.ok(sub, 'submission for our affordance id exists');
    assert.deepEqual(sub.payload, { answer: 'yes' });
    // at must be a valid RFC3339 timestamp
    assert.ok(!isNaN(Date.parse(sub.at)), `at is a parseable date: ${sub.at}`);
  });

  test('missing payload normalizes to null', async () => {
    const beforeCount = JSON.parse(readFileSync(ctx.stateFile, 'utf8')).submissions.length;
    await httpPost(ctx.port, '/submit', 'application/json',
      JSON.stringify({ id: AFFORDANCE_ID }));

    // Wait for state to update
    await new Promise(r => setTimeout(r, 100));
    const state = JSON.parse(readFileSync(ctx.stateFile, 'utf8'));
    const newSub = state.submissions[beforeCount];
    assert.strictEqual(newSub.payload, null, 'missing payload → null');

    // stdout line should also have null payload
    const lines = ctx.stdoutLines.filter(l => l.startsWith('SUBMIT '));
    const lastLine = lines[lines.length - 1];
    const payloadJson = lastLine.split(' ').slice(2).join(' ');
    assert.equal(payloadJson, 'null');
  });

  test('returns 400 on missing id', async () => {
    const res = await httpPost(ctx.port, '/submit', 'application/json',
      JSON.stringify({ payload: 'no-id-here' }));
    assert.equal(res.status, 400);
  });

  test('returns 400 on malformed JSON', async () => {
    const res = await httpPost(ctx.port, '/submit', 'application/json', 'not-json{{{');
    assert.equal(res.status, 400);
  });

  test('null payload explicit is null in state', async () => {
    const beforeCount = JSON.parse(readFileSync(ctx.stateFile, 'utf8')).submissions.length;
    await httpPost(ctx.port, '/submit', 'application/json',
      JSON.stringify({ id: AFFORDANCE_ID, payload: null }));
    await new Promise(r => setTimeout(r, 100));
    const state = JSON.parse(readFileSync(ctx.stateFile, 'utf8'));
    const sub = state.submissions[beforeCount];
    assert.strictEqual(sub.payload, null);
  });

  test('multiline payload JSON-escaped on SUBMIT line (stays one line)', async () => {
    const multiline = 'line one\nline two\nline three';
    await httpPost(ctx.port, '/submit', 'application/json',
      JSON.stringify({ id: AFFORDANCE_ID, payload: multiline }));

    await new Promise(r => setTimeout(r, 100));
    // Find last SUBMIT line
    const lines = ctx.stdoutLines.filter(l => l.startsWith('SUBMIT '));
    const last = lines[lines.length - 1];
    // The entire SUBMIT line must be a single line (no literal newlines)
    assert.ok(!last.includes('\n'), 'SUBMIT line contains no newline');
    // Payload should round-trip correctly
    const payloadJson = last.split(' ').slice(2).join(' ');
    assert.equal(JSON.parse(payloadJson), multiline);
  });
});

describe('POST /submit — unsupported content type', () => {
  const AFFORDANCE_ID = 'aff-' + randomBytes(4).toString('hex');
  let ctx;

  before(async () => {
    ctx = spawnServer({ [AFFORDANCE_ID]: { label: 'Test', intent: 'test' } });
    await waitReady(ctx.port);
  });
  after(() => teardown(ctx));

  test('application/x-www-form-urlencoded returns 415', async () => {
    const res = await httpPost(ctx.port, '/submit',
      'application/x-www-form-urlencoded', `id=${AFFORDANCE_ID}&payload=x`);
    assert.equal(res.status, 415);
  });
});

describe('POST /submit — multipart/form-data', () => {
  const AFFORDANCE_ID = 'aff-' + randomBytes(4).toString('hex');
  let ctx;

  before(async () => {
    ctx = spawnServer({ [AFFORDANCE_ID]: { label: 'Upload', intent: 'upload_file' } });
    await waitReady(ctx.port);
  });
  after(() => teardown(ctx));

  test('accepts file upload and emits SUBMIT with files array', async () => {
    const boundary = 'BOUNDARY' + randomBytes(4).toString('hex');
    const fileContent = 'hello from upload test';
    const body = buildMultipart(boundary, [
      { name: 'id', data: AFFORDANCE_ID },
      { name: 'attachment', filename: 'test.txt', contentType: 'text/plain', data: fileContent },
    ]);

    const res = await httpPost(ctx.port, '/submit', `multipart/form-data; boundary=${boundary}`, body);
    assert.equal(res.status, 200);

    const line = await waitForSubmit(ctx.stdoutLines);
    const parts = line.split(' ');
    assert.equal(parts[0], 'SUBMIT');
    assert.equal(parts[1], AFFORDANCE_ID);

    const payload = JSON.parse(parts.slice(2).join(' '));
    assert.ok(Array.isArray(payload.files), 'payload.files is array');
    assert.ok(payload.files.length >= 1, 'at least one file path');
    // The file path should be absolute
    assert.ok(payload.files[0].startsWith('/'), 'file path is absolute');

    // The uploaded file should be readable at that path
    const saved = readFileSync(payload.files[0], 'utf8');
    assert.equal(saved, fileContent);
  });

  test('multipart submission recorded in state file', async () => {
    const state = JSON.parse(readFileSync(ctx.stateFile, 'utf8'));
    const sub = state.submissions.find(s => s.id === AFFORDANCE_ID);
    assert.ok(sub, 'submission found in state');
    assert.ok(Array.isArray(sub.payload.files), 'payload has files array');
  });

  test('multipart without files still has empty files array', async () => {
    const boundary = 'BOUNDARY' + randomBytes(4).toString('hex');
    const body = buildMultipart(boundary, [
      { name: 'id', data: AFFORDANCE_ID },
      { name: 'extra', data: 'some-value' },
    ]);

    const beforeCount = JSON.parse(readFileSync(ctx.stateFile, 'utf8')).submissions.length;
    const res = await httpPost(ctx.port, '/submit', `multipart/form-data; boundary=${boundary}`, body);
    assert.equal(res.status, 200);

    await new Promise(r => setTimeout(r, 150));
    const state = JSON.parse(readFileSync(ctx.stateFile, 'utf8'));
    const sub = state.submissions[beforeCount];
    assert.ok(Array.isArray(sub.payload.files), 'files array present');
    assert.equal(sub.payload.files.length, 0, 'empty files array when no files uploaded');
    assert.equal(sub.payload.extra, 'some-value', 'other form fields passed through');
  });
});

describe('State file schema', () => {
  let ctx;
  before(async () => {
    ctx = spawnServer({ 'id1': { label: 'A', intent: { action: 'do_thing', ref: 42 } } });
    await waitReady(ctx.port);
  });
  after(() => teardown(ctx));

  test('initial state has correct schema shape', () => {
    const state = JSON.parse(readFileSync(ctx.stateFile, 'utf8'));
    assert.ok(typeof state.session_id === 'string' && state.session_id.length > 0, 'session_id');
    assert.ok(typeof state.affordances === 'object', 'affordances object');
    assert.ok(Array.isArray(state.submissions), 'submissions array');
    assert.equal(state.submissions.length, 0);
  });

  test('affordance intent survives as arbitrary JSON (object)', () => {
    const state = JSON.parse(readFileSync(ctx.stateFile, 'utf8'));
    const aff = state.affordances['id1'];
    assert.ok(aff, 'affordance exists');
    assert.equal(aff.label, 'A');
    assert.deepEqual(aff.intent, { action: 'do_thing', ref: 42 });
  });

  test('submission at field parses as RFC3339 date', async () => {
    await httpPost(ctx.port, '/submit', 'application/json',
      JSON.stringify({ id: 'id1', payload: 'test' }));
    await new Promise(r => setTimeout(r, 100));
    const state = JSON.parse(readFileSync(ctx.stateFile, 'utf8'));
    const sub = state.submissions[0];
    const parsed = new Date(sub.at);
    assert.ok(!isNaN(parsed.getTime()), `at="${sub.at}" must be a valid date`);
    // Should include timezone marker (Z or offset)
    assert.ok(sub.at.includes('T') && (sub.at.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(sub.at)),
      `at="${sub.at}" should be RFC3339`);
  });
});

describe('Unknown routes', () => {
  let ctx;
  before(async () => { ctx = spawnServer(); await waitReady(ctx.port); });
  after(() => teardown(ctx));

  test('GET /unknown returns 404', async () => {
    const res = await httpGet(ctx.port, '/unknown-route');
    assert.equal(res.status, 404);
  });

  test('POST to non-submit path returns 404', async () => {
    const res = await httpPost(ctx.port, '/other', 'application/json', '{}');
    assert.equal(res.status, 404);
  });
});

describe('Concurrent submissions (state file integrity)', () => {
  const ID = 'concurrent-aff';
  let ctx;

  before(async () => {
    ctx = spawnServer({ [ID]: { label: 'Btn', intent: 'concurrent_test' } });
    await waitReady(ctx.port);
  });
  after(() => teardown(ctx));

  test('concurrent POST /submit requests all land in state', async () => {
    const N = 10;
    await Promise.all(
      Array.from({ length: N }, (_, i) =>
        httpPost(ctx.port, '/submit', 'application/json',
          JSON.stringify({ id: ID, payload: { n: i } }))
      )
    );

    // Give the server a moment to flush all writes
    await new Promise(r => setTimeout(r, 200));

    const state = JSON.parse(readFileSync(ctx.stateFile, 'utf8'));
    assert.ok(state.submissions.length >= N,
      `expected >= ${N} submissions, got ${state.submissions.length}`);
  });
});
