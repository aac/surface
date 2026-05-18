// poke reference worker — hosted substrate sibling to examples/server.go
// and examples/server.py. Implements the wire described in
// references/hosted-example.md.
//
// The agent provisions a session (POST /_provision, gated by a shared
// secret), receives an unguessable session ID, and ships the resulting URL
// to the user through whatever channel applies. The browser loads the
// session's HTML, POSTs a submission, and the agent autonomously drains by
// polling GET /<id>/poll?since=<cursor>. See references/lifecycle.md for
// the polling-drain mechanism and references/security.md for the hosted
// posture's CSRF + URL-unguessability notes.

/// <reference types="@cloudflare/workers-types" />

export interface Env {
  POKE_STATE: KVNamespace;
  // Bearer token required for POST /_provision. Set via:
  //   wrangler secret put PROVISION_TOKEN
  PROVISION_TOKEN: string;
}

// Session state mirrors the local wire's state shape (see
// references/wire-example.md), with a few hosted-substrate-only fields:
//   - html: the agent-rendered surface bytes (KV holds it inline; for
//     anything more than a few KB the agent should reach for R2 instead).
//   - csrf_token: validated on POST /submit so cross-origin scripts can't
//     forge submissions even if they guess the session ID.
//   - created_at: lets agents (and a future GC) reason about lifetime.
//
// Submissions are append-only and timestamped in unix-ms so /poll can
// filter with a cursor without parsing RFC3339 strings on each request.
interface SessionState {
  session_id: string;
  affordances: Record<string, { label: string; intent: unknown }>;
  submissions: Array<{
    id: string;
    payload: unknown;
    at: string; // RFC3339Nano, matches local wire
    at_ms: number; // unix-ms cursor for /poll
  }>;
  html: string;
  csrf_token: string;
  created_at: string;
}

interface ProvisionBody {
  html: string;
  affordances?: Record<string, { label: string; intent: unknown }>;
}

interface SubmitBody {
  id: string;
  payload: unknown;
  csrf_token?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ENC = new TextEncoder();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function textResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

// 16 random bytes -> 32 hex chars (~128 bits of entropy). crypto.getRandomValues
// is CSPRNG-backed in Workers (same source as crypto.randomUUID()).
function randomHex(bytes = 16): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

function stateKey(sessionId: string): string {
  return `session:${sessionId}:state`;
}

async function readState(env: Env, sessionId: string): Promise<SessionState | null> {
  const raw = await env.POKE_STATE.get(stateKey(sessionId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionState;
  } catch {
    return null;
  }
}

// Session state self-cleans after SESSION_TTL_SECONDS of inactivity. The TTL
// is refreshed on every write (provision + each submission), so an active
// session keeps its full lifetime ahead of it; once writes stop, KV evicts
// the key automatically. 30 days is a deliberate over-shoot for the
// ephemeral-surface use case: human-paced approval flows resolve in minutes
// to hours, so 30d covers "I opened a poke before vacation, the user
// answered when they got back" without anyone thinking about GC. Tunable
// per-deployment by editing the constant; KV's minimum is 60s. Anything
// shorter would risk evicting a session mid-poll for an agent on a slow
// cadence.
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

async function writeState(env: Env, state: SessionState): Promise<void> {
  await env.POKE_STATE.put(stateKey(state.session_id), JSON.stringify(state), {
    expirationTtl: SESSION_TTL_SECONDS,
  });
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// GET /
//
// Bare root has no legitimate visitor. Real visitors come to /<session_id>;
// the agent provisions via POST /_provision. Returning a 404 (empty body)
// keeps the worker invisible infrastructure — no landing page that advertises
// the deployment, no leak that confirms "there's a poke worker here." See
// references/hosted-example.md "Bare root" for the rationale.
function handleIndex(): Response {
  return new Response(null, { status: 404 });
}

// POST /_provision
//
// Agent-only. Body: { html, affordances? }. Returns { session_id, url,
// csrf_token }. The CSRF token is also embedded in the rendered HTML so
// the browser can echo it back on POST /<id>/submit.
//
// Auth: Bearer token compared against env.PROVISION_TOKEN. Without it, the
// worker would let anyone provision sessions on the agent's namespace.
async function handleProvision(req: Request, env: Env): Promise<Response> {
  const auth = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${env.PROVISION_TOKEN}`;
  if (!env.PROVISION_TOKEN || auth !== expected) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  let body: ProvisionBody;
  try {
    body = (await req.json()) as ProvisionBody;
  } catch {
    return jsonResponse({ error: "invalid json" }, 400);
  }
  if (!body || typeof body.html !== "string" || body.html.length === 0) {
    return jsonResponse({ error: "missing html" }, 400);
  }

  const sessionId = randomHex(16); // ~128 bits — the URL is the access boundary
  const csrfToken = randomHex(16);
  const state: SessionState = {
    session_id: sessionId,
    affordances: body.affordances ?? {},
    submissions: [],
    html: body.html,
    csrf_token: csrfToken,
    created_at: new Date().toISOString(),
  };
  await writeState(env, state);

  // Canonical surface URL ends in a trailing slash so relative-path fetches
  // in the served HTML (e.g. fetch('./submit')) resolve to /<sid>/submit.
  // The router also 308-redirects /<sid> -> /<sid>/ for visitors who arrive
  // at the bare form, so this is defense-in-depth.
  const url = new URL(req.url);
  const surfaceUrl = `${url.protocol}//${url.host}/${sessionId}/`;
  return jsonResponse({ session_id: sessionId, url: surfaceUrl, csrf_token: csrfToken });
}

// GET /<session_id>
//
// Serves the HTML the agent provisioned. A small <meta> + <script> shim
// injects the CSRF token into a window-global so the agent's HTML can
// reference it without templating ceremony:
//
//   fetch('./submit', { headers: { 'x-poke-csrf': window.POKE_CSRF_TOKEN } })
//
// no-store so a previous tab on the same URL doesn't keep serving stale
// HTML after a re-provision. Same hazard the Go reference flags for
// localhost; it carries over here.
function renderSessionPage(state: SessionState): Response {
  const shim = `<script>window.POKE_CSRF_TOKEN=${JSON.stringify(state.csrf_token)};window.POKE_SESSION_ID=${JSON.stringify(state.session_id)};</script>`;
  // Inject the shim just before </head> if present, else prepend to <body>,
  // else prepend at the top. The agent's HTML is treated as authoritative;
  // we only add the smallest piece of glue that lets it reach the CSRF
  // token without reading it from another endpoint.
  let html = state.html;
  if (html.includes("</head>")) {
    html = html.replace("</head>", `${shim}</head>`);
  } else if (html.includes("<body")) {
    html = html.replace("<body", `${shim}<body`);
  } else {
    html = shim + html;
  }
  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store, must-revalidate",
    },
  });
}

// POST /<session_id>/submit
//
// CSRF strategy (two complementary checks; either rejection 403s):
//   1. Origin header must match the request's Host. Same-origin browser
//      fetches set Origin to the page's origin; cross-origin attacks
//      either set someone else's origin or get it stripped. Permissive on
//      missing Origin only for explicit application/json with the CSRF
//      token (curl, native clients).
//   2. x-poke-csrf header must match the session's csrf_token, OR the JSON
//      body must include {csrf_token}. The token is shipped to the
//      browser via the injection shim in renderSessionPage.
//
// Either check failing returns 403 with a terse reason.
async function handleSubmit(
  req: Request,
  env: Env,
  sessionId: string,
): Promise<Response> {
  const state = await readState(env, sessionId);
  if (!state) return jsonResponse({ error: "session not found" }, 404);

  // Origin check. If present, must be same-host.
  const origin = req.headers.get("origin");
  const host = req.headers.get("host") ?? "";
  if (origin) {
    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      return jsonResponse({ error: "bad origin" }, 403);
    }
    if (originHost !== host) {
      return jsonResponse({ error: "origin mismatch" }, 403);
    }
  }

  // Body must be application/json for v0 (multipart -> 501 below).
  const ct = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (ct !== "application/json") {
    return jsonResponse(
      { error: "unsupported content type", hint: "use application/json" },
      415,
    );
  }

  let body: SubmitBody;
  try {
    body = (await req.json()) as SubmitBody;
  } catch {
    return jsonResponse({ error: "invalid json" }, 400);
  }
  if (!body || typeof body.id !== "string" || body.id.length === 0) {
    return jsonResponse({ error: "missing id" }, 400);
  }

  // CSRF token check. Header takes precedence; body field is the fallback
  // so curl tests stay simple.
  const headerToken = req.headers.get("x-poke-csrf");
  const token = headerToken ?? body.csrf_token ?? "";
  if (!constantTimeEquals(token, state.csrf_token)) {
    return jsonResponse({ error: "csrf token mismatch" }, 403);
  }

  // Append the submission. KV has last-write-wins semantics with eventual
  // consistency; for the v0 ephemeral-surface use case the per-session
  // write rate is "human clicking a button," not a hot path. Concurrent
  // submissions against the same session can in principle stomp each
  // other; documenting this rather than building a CRDT.
  const nowMs = Date.now();
  const entry = {
    id: body.id,
    payload: body.payload ?? null,
    at: new Date(nowMs).toISOString(),
    at_ms: nowMs,
  };
  state.submissions.push(entry);
  await writeState(env, state);

  return jsonResponse({ ok: true, at_ms: nowMs });
}

// Constant-time string comparison so timing differences don't leak the
// CSRF token. Workers don't expose a built-in for this so a manual XOR.
function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const aBytes = ENC.encode(a);
  const bBytes = ENC.encode(b);
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) diff |= aBytes[i] ^ bBytes[i];
  return diff === 0;
}

// GET /<session_id>/poll?since=<unix-ms>
//
// Hosted-substrate drain. Cloudflare Workers can't emit "stdout" the way
// the local Go reference does, so polling is the natural shape: the agent
// owns the cadence (see references/lifecycle.md for the trade-offs).
// Returns:
//   { now_ms, submissions: [<entries with at_ms > since>] }
//
// Agents poll with since=<last seen at_ms> (start with 0) and advance
// the cursor to the largest at_ms they've seen.
async function handlePoll(
  req: Request,
  env: Env,
  sessionId: string,
): Promise<Response> {
  const state = await readState(env, sessionId);
  if (!state) return jsonResponse({ error: "session not found" }, 404);

  const url = new URL(req.url);
  const sinceRaw = url.searchParams.get("since") ?? "0";
  const since = Number.parseInt(sinceRaw, 10);
  if (!Number.isFinite(since) || since < 0) {
    return jsonResponse({ error: "invalid since" }, 400);
  }

  const newer = state.submissions.filter((s) => s.at_ms > since);
  return jsonResponse({ now_ms: Date.now(), submissions: newer });
}

// POST /<session_id>/upload — multipart file uploads.
//
// Out of scope for the worker v0. KV doesn't fit binary blobs cleanly
// (1MiB per value cap, base64 overhead, no streaming) and R2 adds another
// binding plus per-deployment configuration. Documented in
// references/hosted-example.md and tracked as a v2 candidate. Returns 501
// with a pointer rather than failing silently.
function handleUpload(): Response {
  return jsonResponse(
    {
      error: "not implemented",
      hint: "multipart file uploads are out of scope for the worker v0; see references/hosted-example.md",
    },
    501,
  );
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;

    // Root + provision are flat routes. Bare root 404s for any method —
    // there's no landing page and exposing a method-allowed surface would
    // leak that the worker is here.
    if (path === "/" || path === "") {
      return handleIndex();
    }
    if (path === "/_provision") {
      if (req.method !== "POST") return textResponse("method not allowed", 405);
      return handleProvision(req, env);
    }

    // Everything else is /<session_id>[/...]. Split once to keep the
    // session-id parsing local; reject obviously invalid IDs early so the
    // KV layer doesn't see paths like "/.." or "/.well-known/...".
    const trimmed = path.startsWith("/") ? path.slice(1) : path;
    const segments = trimmed.split("/");
    const sessionId = segments[0];
    if (!/^[a-f0-9]{16,64}$/.test(sessionId)) {
      return textResponse("not found", 404);
    }
    const tail = segments.slice(1).join("/");

    // The canonical session URL is /<session_id>/ (trailing slash). Relative
    // fetches in the served HTML (e.g. fetch('./submit')) resolve against
    // the page URL — and from a no-trailing-slash /<sid>, the browser
    // resolves ./submit to /submit (root), which 404s. Redirect bare
    // /<sid> to /<sid>/ so relative paths resolve as intended.
    //
    // 308 (Permanent Redirect) preserves method + body; it's the safer
    // pick over 301 for any future POST that lands here by mistake. GETs
    // (the common case — a user opening the URL) follow it transparently.
    if (tail === "" && !path.endsWith("/")) {
      const redirectUrl = `${url.origin}/${sessionId}/${url.search}`;
      return new Response(null, {
        status: 308,
        headers: { location: redirectUrl },
      });
    }

    if (tail === "") {
      if (req.method !== "GET") return textResponse("method not allowed", 405);
      const state = await readState(env, sessionId);
      if (!state) return textResponse("session not found", 404);
      return renderSessionPage(state);
    }
    if (tail === "submit") {
      if (req.method !== "POST") return textResponse("method not allowed", 405);
      return handleSubmit(req, env, sessionId);
    }
    if (tail === "poll") {
      if (req.method !== "GET") return textResponse("method not allowed", 405);
      return handlePoll(req, env, sessionId);
    }
    if (tail === "upload") {
      if (req.method !== "POST") return textResponse("method not allowed", 405);
      return handleUpload();
    }

    return textResponse("not found", 404);
  },
} satisfies ExportedHandler<Env>;
