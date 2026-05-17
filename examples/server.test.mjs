// Wire-contract tests for the Node reference server.
//
// We assert what references/wire-example.md says — not what any sibling
// implementation does. Operational divergences (port, error statuses,
// watchdog) are out of scope here.
//
// Run with: node --test examples/server.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Buffer } from 'node:buffer';

import {
  createPokeServer,
  parseMultipart,
  extractBoundary,
  sanitizeFilename,
  atomicWriteJSON,
} from './server.mjs';

// ---------------------------------------------------------------------------
// Test harness: spin up a real HTTP server on an ephemeral port.

async function withServer(t, { html = DEFAULT_HTML, initialState = INITIAL_STATE } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'poke-test-'));
  const statePath = join(dir, 'state.json');
  const htmlPath = join(dir, 'page.html');
  await writeFile(htmlPath, html);
  await writeFile(statePath, JSON.stringify(initialState, null, 2));

  const emissions = [];
  const server = createPokeServer({
    statePath,
    htmlPath,
    emit: (line) => emissions.push(line),
  });

  await new Promise((res) => server.listen(0, '127.0.0.1', res));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  t.after(async () => {
    await new Promise((res) => server.close(res));
    await rm(dir, { recursive: true, force: true });
  });

  return { base, statePath, htmlPath, dir, emissions, server };
}

const DEFAULT_HTML = '<!doctype html><html><body>hello</body></html>';
const INITIAL_STATE = {
  session_id: 's_test',
  affordances: {
    confirm: { label: 'Confirm', intent: 'confirm_op' },
    upload:  { label: 'Upload',  intent: 'receive_file' },
  },
  submissions: [],
};

async function readState(statePath) {
  return JSON.parse(await readFile(statePath, 'utf8'));
}

// ---------------------------------------------------------------------------
// GET /

test('GET / serves the HTML body with text/html', async (t) => {
  const { base } = await withServer(t);
  const res = await fetch(base + '/');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
  assert.equal(await res.text(), DEFAULT_HTML);
});

test('GET on an unknown path returns 404', async (t) => {
  const { base } = await withServer(t);
  const res = await fetch(base + '/nope');
  assert.equal(res.status, 404);
});

// ---------------------------------------------------------------------------
// GET /static/

test('GET /static/<path> serves files from the HTML directory', async (t) => {
  const { base, dir } = await withServer(t);
  await writeFile(join(dir, 'style.css'), 'body { color: red; }');
  const res = await fetch(base + '/static/style.css');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/css/);
  assert.equal(await res.text(), 'body { color: red; }');
});

test('GET /static/<missing> returns 404', async (t) => {
  const { base } = await withServer(t);
  const res = await fetch(base + '/static/missing.css');
  assert.equal(res.status, 404);
});

test('GET /static/ rejects path traversal', async (t) => {
  const { base } = await withServer(t);
  const res = await fetch(base + '/static/..%2F..%2Fetc%2Fpasswd');
  assert.ok(res.status === 403 || res.status === 404, `unexpected ${res.status}`);
});

// ---------------------------------------------------------------------------
// POST /submit — JSON

test('POST /submit (JSON, null payload) appends entry and emits SUBMIT line', async (t) => {
  const { base, statePath, emissions } = await withServer(t);
  const res = await fetch(base + '/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'confirm', payload: null }),
  });
  assert.equal(res.status, 200);

  const state = await readState(statePath);
  assert.equal(state.submissions.length, 1);
  const entry = state.submissions[0];
  assert.equal(entry.id, 'confirm');
  assert.equal(entry.payload, null);
  // RFC3339-ish ISO 8601, parseable by Date.
  assert.ok(!Number.isNaN(Date.parse(entry.at)), `unparseable timestamp: ${entry.at}`);

  // SUBMIT line shape: "SUBMIT <id> <payload-json>", JSON-parseable tail.
  assert.equal(emissions.length, 1);
  const line = emissions[0];
  const [verb, id, ...rest] = line.split(' ');
  assert.equal(verb, 'SUBMIT');
  assert.equal(id, 'confirm');
  const tail = rest.join(' ');
  assert.equal(JSON.parse(tail), null);
});

test('POST /submit (JSON, object payload) round-trips faithfully', async (t) => {
  const { base, statePath, emissions } = await withServer(t);
  const payload = { selected: ['a', 'b'], note: 'looks good' };
  const res = await fetch(base + '/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'confirm', payload }),
  });
  assert.equal(res.status, 200);

  const state = await readState(statePath);
  assert.deepEqual(state.submissions[0].payload, payload);

  // SUBMIT line: split on first two spaces, JSON-parse remainder.
  const line = emissions[0];
  const firstSpace = line.indexOf(' ');
  const secondSpace = line.indexOf(' ', firstSpace + 1);
  const verb = line.slice(0, firstSpace);
  const id = line.slice(firstSpace + 1, secondSpace);
  const tail = line.slice(secondSpace + 1);
  assert.equal(verb, 'SUBMIT');
  assert.equal(id, 'confirm');
  assert.deepEqual(JSON.parse(tail), payload);
});

test('POST /submit (JSON, missing payload) normalises to null', async (t) => {
  const { base, statePath, emissions } = await withServer(t);
  const res = await fetch(base + '/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'confirm' }),
  });
  assert.equal(res.status, 200);

  const state = await readState(statePath);
  assert.equal(state.submissions[0].payload, null);

  // SUBMIT line must carry literal `null` as the payload-json token.
  assert.equal(emissions[0], 'SUBMIT confirm null');
});

test('POST /submit (JSON, malformed body) returns 4xx and does not record', async (t) => {
  const { base, statePath, emissions } = await withServer(t);
  const res = await fetch(base + '/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: 'not-json-at-all',
  });
  assert.ok(res.status >= 400 && res.status < 500, `unexpected ${res.status}`);
  const state = await readState(statePath);
  assert.equal(state.submissions.length, 0);
  assert.equal(emissions.length, 0);
});

test('POST /submit (JSON, missing id) returns 4xx', async (t) => {
  const { base } = await withServer(t);
  const res = await fetch(base + '/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload: 'orphan' }),
  });
  assert.ok(res.status >= 400 && res.status < 500, `unexpected ${res.status}`);
});

test('POST /submit (JSON, multi-line user input) emits a single-line SUBMIT', async (t) => {
  const { base, emissions } = await withServer(t);
  const payload = { note: 'line one\nline two\nline three' };
  const res = await fetch(base + '/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'confirm', payload }),
  });
  assert.equal(res.status, 200);

  // Wire contract: the SUBMIT emission is exactly one line. Multi-line user
  // input must survive as JSON-escaped \n in the payload.
  assert.equal(emissions.length, 1);
  assert.ok(!emissions[0].includes('\n'), 'SUBMIT line must not contain a literal newline');
  const tail = emissions[0].slice('SUBMIT confirm '.length);
  assert.deepEqual(JSON.parse(tail), payload);
});

// ---------------------------------------------------------------------------
// POST /submit — multipart/form-data

function buildMultipart(boundary, fields) {
  // fields: array of { name, filename?, contentType?, value: string|Buffer }
  const parts = [];
  for (const f of fields) {
    let headers = `Content-Disposition: form-data; name="${f.name}"`;
    if (f.filename != null) headers += `; filename="${f.filename}"`;
    headers += '\r\n';
    if (f.contentType) headers += `Content-Type: ${f.contentType}\r\n`;
    parts.push(
      Buffer.concat([
        Buffer.from(`--${boundary}\r\n${headers}\r\n`),
        Buffer.isBuffer(f.value) ? f.value : Buffer.from(f.value),
        Buffer.from('\r\n'),
      ]),
    );
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return Buffer.concat(parts);
}

test('POST /submit (multipart) stores files, emits SUBMIT with files[] payload', async (t) => {
  const { base, statePath, emissions } = await withServer(t);
  const boundary = 'AaB03x';
  const body = buildMultipart(boundary, [
    { name: 'id', value: 'upload' },
    { name: 'note', value: 'a quick note' },
    { name: 'receipt', filename: 'receipt.txt', contentType: 'text/plain', value: 'hello file' },
  ]);

  const res = await fetch(base + '/submit', {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body,
  });
  assert.equal(res.status, 200);

  const state = await readState(statePath);
  assert.equal(state.submissions.length, 1);
  const entry = state.submissions[0];
  assert.equal(entry.id, 'upload');
  assert.ok(Array.isArray(entry.payload.files));
  assert.equal(entry.payload.files.length, 1);
  assert.equal(entry.payload.note, 'a quick note');

  // The stored file should exist and contain what we sent.
  const stored = entry.payload.files[0];
  const storedContent = await readFile(stored, 'utf8');
  assert.equal(storedContent, 'hello file');
  // Stored path is absolute and includes the (sanitised) basename.
  assert.ok(stored.startsWith('/'));
  assert.ok(stored.endsWith('-receipt.txt'), `unexpected stored path: ${stored}`);

  // SUBMIT line carries the file-bearing payload as the JSON tail.
  assert.equal(emissions.length, 1);
  const tail = emissions[0].slice('SUBMIT upload '.length);
  const parsedTail = JSON.parse(tail);
  assert.deepEqual(parsedTail.files, [stored]);
  assert.equal(parsedTail.note, 'a quick note');

  // Cleanup the stored upload (the agent owns lifecycle, but the test should
  // not leak files into $TMPDIR/poke-uploads/).
  await rm(stored, { force: true });
});

test('POST /submit (multipart, no files) still produces files: []', async (t) => {
  const { base, statePath, emissions } = await withServer(t);
  const boundary = 'AaB03x';
  const body = buildMultipart(boundary, [
    { name: 'id', value: 'upload' },
    { name: 'note', value: 'no file attached' },
  ]);

  const res = await fetch(base + '/submit', {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body,
  });
  assert.equal(res.status, 200);

  const state = await readState(statePath);
  const entry = state.submissions[0];
  assert.deepEqual(entry.payload.files, []);
  assert.equal(entry.payload.note, 'no file attached');

  const tail = emissions[0].slice('SUBMIT upload '.length);
  assert.deepEqual(JSON.parse(tail).files, []);
});

test('POST /submit (multipart) handles multiple files', async (t) => {
  const { base, statePath } = await withServer(t);
  const boundary = 'AaB03x';
  const body = buildMultipart(boundary, [
    { name: 'id', value: 'upload' },
    { name: 'first', filename: 'a.txt', contentType: 'text/plain', value: 'AAA' },
    { name: 'second', filename: 'b.txt', contentType: 'text/plain', value: 'BBB' },
  ]);

  const res = await fetch(base + '/submit', {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body,
  });
  assert.equal(res.status, 200);

  const entry = (await readState(statePath)).submissions[0];
  assert.equal(entry.payload.files.length, 2);
  const contents = await Promise.all(entry.payload.files.map((p) => readFile(p, 'utf8')));
  assert.deepEqual(contents.sort(), ['AAA', 'BBB']);
  await Promise.all(entry.payload.files.map((p) => rm(p, { force: true })));
});

// ---------------------------------------------------------------------------
// Content-type and size policy

test('POST /submit with urlencoded body is rejected (not a wire-accepted content type)', async (t) => {
  const { base, statePath, emissions } = await withServer(t);
  const res = await fetch(base + '/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'id=confirm&payload=null',
  });
  assert.ok(res.status >= 400 && res.status < 500, `unexpected ${res.status}`);
  const state = await readState(statePath);
  assert.equal(state.submissions.length, 0);
  assert.equal(emissions.length, 0);
});

test('POST /submit with no content-type is rejected', async (t) => {
  const { base } = await withServer(t);
  const res = await fetch(base + '/submit', { method: 'POST', body: 'whatever' });
  assert.ok(res.status >= 400 && res.status < 500, `unexpected ${res.status}`);
});

// ---------------------------------------------------------------------------
// Atomic write + concurrent submissions

test('concurrent submissions do not lose entries', async (t) => {
  const { base, statePath } = await withServer(t);
  const N = 20;
  const tasks = [];
  for (let i = 0; i < N; i++) {
    tasks.push(
      fetch(base + '/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'confirm', payload: { i } }),
      }),
    );
  }
  const results = await Promise.all(tasks);
  for (const r of results) assert.equal(r.status, 200);

  const state = await readState(statePath);
  assert.equal(state.submissions.length, N);
  const seen = new Set(state.submissions.map((e) => e.payload.i));
  for (let i = 0; i < N; i++) assert.ok(seen.has(i), `lost submission ${i}`);
});

test('atomicWriteJSON leaves a valid file on disk', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'poke-atomic-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'out.json');
  await atomicWriteJSON(path, { hello: 'world', n: 42 });
  const parsed = JSON.parse(await readFile(path, 'utf8'));
  assert.deepEqual(parsed, { hello: 'world', n: 42 });
  // No leftover temp file.
  const entries = await import('node:fs/promises').then((m) => m.readdir(dir));
  assert.deepEqual(entries, ['out.json']);
});

// ---------------------------------------------------------------------------
// Unit-level: multipart parser and filename sanitiser

test('parseMultipart parses a well-formed body', () => {
  const boundary = 'XYZ';
  const body = buildMultipart(boundary, [
    { name: 'id', value: 'abc' },
    { name: 'doc', filename: 'note.txt', contentType: 'text/plain', value: 'hello' },
  ]);
  const parts = parseMultipart(body, boundary);
  assert.equal(parts.length, 2);
  assert.equal(parts[0].name, 'id');
  assert.equal(parts[0].filename, undefined);
  assert.equal(parts[0].content.toString(), 'abc');
  assert.equal(parts[1].name, 'doc');
  assert.equal(parts[1].filename, 'note.txt');
  assert.equal(parts[1].contentType, 'text/plain');
  assert.equal(parts[1].content.toString(), 'hello');
});

test('extractBoundary handles quoted and bare boundaries', () => {
  assert.equal(extractBoundary('multipart/form-data; boundary=AaB03x'), 'AaB03x');
  assert.equal(extractBoundary('multipart/form-data; boundary="AaB03x"'), 'AaB03x');
  assert.equal(extractBoundary('multipart/form-data; charset=utf-8; boundary=AaB03x'), 'AaB03x');
  assert.equal(extractBoundary('multipart/form-data'), null);
});

test('sanitizeFilename strips directory components and unsafe chars', () => {
  assert.equal(sanitizeFilename('../../etc/passwd'), 'passwd');
  assert.equal(sanitizeFilename('Receipt 2026 (final).pdf'), 'Receipt_2026_final_.pdf');
  assert.equal(sanitizeFilename(''), 'upload');
  assert.equal(sanitizeFilename('/'), 'upload');
});
