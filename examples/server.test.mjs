// Tests for examples/server.mjs — Node sibling of examples/server_test.go
// and examples/test_server.py. Uses Node's stdlib `node:test` runner so
// nothing in this repo needs a package.json or installed deps.
//
// Runnable as:
//
//     node --test examples/server.test.mjs
//
// The tests spin a real HTTP server on 127.0.0.1:0, hit it with
// node:http's fetch, and assert against the state file and a captured
// stdout buffer. The server's record() path takes a stdoutWrite function
// so tests collect SUBMIT lines without monkey-patching globals — same
// shape as the test approach in the Go/Python siblings.

import test from 'node:test';
import { strict as assert } from 'node:assert';
import { readFile, writeFile, mkdtemp, rm, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { Buffer } from 'node:buffer';

import { buildServer, watchParentDeath } from './server.mjs';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

async function makeWorkspace() {
  const dir = await mkdtemp(join(tmpdir(), 'poke-node-test-'));
  return {
    dir,
    statePath: join(dir, 'state.json'),
    htmlPath: join(dir, 'page.html'),
    async cleanup() {
      try { await rm(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    },
  };
}

async function writeInitialState(path, affordances = {}) {
  const state = {
    session_id: `test-${randomBytes(4).toString('hex')}`,
    affordances,
    submissions: [],
  };
  await writeFile(path, JSON.stringify(state));
}

async function startServer(statePath, htmlPath) {
  const captured = { stdout: '' };
  const server = buildServer({
    statePath,
    htmlPath,
    stdoutWrite: (s) => { captured.stdout += s; },
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    captured,
    async stop() {
      await new Promise((resolve) => server.close(() => resolve()));
    },
  };
}

// Minimal multipart body builder so the test file pulls in no deps.
function buildMultipart(fields, files) {
  const boundary = '----pokeNodeTestBoundary' + randomBytes(4).toString('hex');
  const crlf = '\r\n';
  const chunks = [];
  for (const [name, value] of Object.entries(fields)) {
    chunks.push(Buffer.from(`--${boundary}${crlf}`));
    chunks.push(Buffer.from(`Content-Disposition: form-data; name="${name}"${crlf}${crlf}`));
    chunks.push(Buffer.from(`${value}${crlf}`));
  }
  for (const { fieldName, filename, data } of files) {
    chunks.push(Buffer.from(`--${boundary}${crlf}`));
    chunks.push(Buffer.from(
      `Content-Disposition: form-data; name="${fieldName}"; filename="${filename}"${crlf}` +
      `Content-Type: application/octet-stream${crlf}${crlf}`
    ));
    chunks.push(Buffer.from(data));
    chunks.push(Buffer.from(crlf));
  }
  chunks.push(Buffer.from(`--${boundary}--${crlf}`));
  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('GET / serves HTML with Cache-Control: no-store', async (t) => {
  const ws = await makeWorkspace();
  t.after(() => ws.cleanup());
  await writeFile(ws.htmlPath, '<html><body>hello poke</body></html>');
  await writeInitialState(ws.statePath);

  const srv = await startServer(ws.statePath, ws.htmlPath);
  t.after(() => srv.stop());

  const resp = await fetch(srv.baseUrl + '/');
  assert.equal(resp.status, 200);
  const body = await resp.text();
  assert.match(body, /hello poke/);
  // Mirrors the Go/Python reference assertions: no-store guards against
  // stale-tab hazard on a reused port.
  const cc = resp.headers.get('cache-control') ?? '';
  assert.ok(cc.includes('no-store'), `Cache-Control missing no-store: ${cc}`);
  assert.ok(cc.includes('must-revalidate'), `Cache-Control missing must-revalidate: ${cc}`);
});

test('POST /submit (json) appends state and emits SUBMIT line', async (t) => {
  const ws = await makeWorkspace();
  t.after(() => ws.cleanup());
  await writeFile(ws.htmlPath, '<html></html>');
  await writeInitialState(ws.statePath, { abc: { label: 'Yes', intent: 'yes' } });

  const srv = await startServer(ws.statePath, ws.htmlPath);
  t.after(() => srv.stop());

  const resp = await fetch(srv.baseUrl + '/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'abc', payload: null }),
  });
  assert.equal(resp.status, 200);

  // Stdout shape per shared contract: "SUBMIT <id> <payload-json>\n".
  const out = srv.captured.stdout;
  assert.ok(out.startsWith('SUBMIT abc '), `unexpected stdout: ${JSON.stringify(out)}`);
  const trimmed = out.trim();
  const parts = trimmed.split(' ');
  assert.equal(parts[0], 'SUBMIT');
  assert.equal(parts[1], 'abc');
  // Remainder is JSON-parsable per the locked contract.
  const payload = JSON.parse(parts.slice(2).join(' '));
  assert.equal(payload, null);

  const state = JSON.parse(await readFile(ws.statePath, 'utf-8'));
  assert.equal(state.submissions.length, 1);
  assert.equal(state.submissions[0].id, 'abc');
  assert.equal(state.submissions[0].payload, null);
  assert.ok(typeof state.submissions[0].at === 'string' && state.submissions[0].at.length > 0);
});

test('POST /submit (json) without id returns 400', async (t) => {
  const ws = await makeWorkspace();
  t.after(() => ws.cleanup());
  await writeFile(ws.htmlPath, '<html></html>');
  await writeInitialState(ws.statePath);

  const srv = await startServer(ws.statePath, ws.htmlPath);
  t.after(() => srv.stop());

  const resp = await fetch(srv.baseUrl + '/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload: null }),
  });
  assert.equal(resp.status, 400);
});

test('POST /submit (multipart) stores upload and emits SUBMIT line', async (t) => {
  const ws = await makeWorkspace();
  t.after(() => ws.cleanup());
  await writeFile(ws.htmlPath, '<html></html>');
  await writeInitialState(ws.statePath, { 'upload-btn': { label: 'Upload', intent: 'upload' } });

  const srv = await startServer(ws.statePath, ws.htmlPath);
  t.after(() => srv.stop());

  const wantBytes = Buffer.from('hello bytes');
  const { body, contentType } = buildMultipart(
    { id: 'upload-btn' },
    [{ fieldName: 'upload', filename: 'greeting.txt', data: wantBytes }],
  );

  const resp = await fetch(srv.baseUrl + '/submit', {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body,
  });
  assert.equal(resp.status, 200, `body: ${await resp.text().catch(() => '<no body>')}`);

  const out = srv.captured.stdout.trim();
  assert.ok(out.startsWith('SUBMIT upload-btn '), `unexpected stdout: ${JSON.stringify(out)}`);
  const payloadJson = out.split(' ').slice(2).join(' ');
  const payload = JSON.parse(payloadJson);
  assert.ok(Array.isArray(payload.files), 'payload.files missing');
  assert.equal(payload.files.length, 1);
  const storedPath = payload.files[0];
  assert.ok(typeof storedPath === 'string' && storedPath.startsWith('/'),
    `not absolute: ${storedPath}`);
  t.after(async () => { try { await unlink(storedPath); } catch { /* ignore */ } });

  const got = await readFile(storedPath);
  assert.deepEqual(Buffer.from(got), wantBytes);

  const state = JSON.parse(await readFile(ws.statePath, 'utf-8'));
  assert.equal(state.submissions.length, 1);
  assert.equal(state.submissions[0].id, 'upload-btn');
  assert.deepEqual(state.submissions[0].payload.files, [storedPath]);
});

test('POST /submit (multipart) with no files yields empty files array, not null', async (t) => {
  // Per the act-0cd3 fix mirrored in the Go and Python references: `files`
  // must serialize as `[]` rather than `null` when the multipart body has
  // no file parts.
  const ws = await makeWorkspace();
  t.after(() => ws.cleanup());
  await writeFile(ws.htmlPath, '<html></html>');
  await writeInitialState(ws.statePath, { btn: { label: 'Click', intent: 'click' } });

  const srv = await startServer(ws.statePath, ws.htmlPath);
  t.after(() => srv.stop());

  const { body, contentType } = buildMultipart({ id: 'btn' }, []);
  const resp = await fetch(srv.baseUrl + '/submit', {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body,
  });
  assert.equal(resp.status, 200);

  const out = srv.captured.stdout.trim();
  const payloadJson = out.split(' ').slice(2).join(' ');
  const payload = JSON.parse(payloadJson);
  assert.deepEqual(payload, { files: [] });
  // And critically the serialization is `[]`, not `null`.
  assert.ok(payloadJson.includes('"files":[]'), `payload JSON missing files:[]: ${payloadJson}`);

  const state = JSON.parse(await readFile(ws.statePath, 'utf-8'));
  assert.deepEqual(state.submissions[0].payload, { files: [] });
});

test('POST /submit (multipart) carries extra text fields through to payload', async (t) => {
  const ws = await makeWorkspace();
  t.after(() => ws.cleanup());
  await writeFile(ws.htmlPath, '<html></html>');
  await writeInitialState(ws.statePath, { feedback: { label: 'Send', intent: 'feedback' } });

  const srv = await startServer(ws.statePath, ws.htmlPath);
  t.after(() => srv.stop());

  const { body, contentType } = buildMultipart(
    { id: 'feedback', comment: 'looks good' },
    [],
  );
  const resp = await fetch(srv.baseUrl + '/submit', {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body,
  });
  assert.equal(resp.status, 200);

  const out = srv.captured.stdout.trim();
  const payload = JSON.parse(out.split(' ').slice(2).join(' '));
  assert.deepEqual(payload.files, []);
  assert.equal(payload.comment, 'looks good');
});

test('POST /submit with unsupported content type returns 415', async (t) => {
  const ws = await makeWorkspace();
  t.after(() => ws.cleanup());
  await writeFile(ws.htmlPath, '<html></html>');
  await writeInitialState(ws.statePath);

  const srv = await startServer(ws.statePath, ws.htmlPath);
  t.after(() => srv.stop());

  const resp = await fetch(srv.baseUrl + '/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'id=abc',
  });
  assert.equal(resp.status, 415);
});

test('GET on unknown path returns 404', async (t) => {
  const ws = await makeWorkspace();
  t.after(() => ws.cleanup());
  await writeFile(ws.htmlPath, '<html></html>');
  await writeInitialState(ws.statePath);

  const srv = await startServer(ws.statePath, ws.htmlPath);
  t.after(() => srv.stop());

  const resp = await fetch(srv.baseUrl + '/does-not-exist');
  assert.equal(resp.status, 404);
});

test('watchParentDeath skips polling when originalPpid <= 1', async () => {
  // Mirrors TestWatchParentDeathSkipsWhenAlreadyInit in server_test.go: a
  // sentinel ppid of 1 should make the watchdog return a no-op handle
  // without scheduling any timer.
  const fakeServer = {
    closed: false,
    close() { this.closed = true; },
  };
  const handle = watchParentDeath(fakeServer, 1, 10);
  // Wait a couple of ticks to confirm no shutdown happens.
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(fakeServer.closed, false, 'server should not have been closed');
  handle.stop();
});
