# poke worker — Cloudflare Worker + KV reference

A hosted-substrate sibling to `examples/server.go` and `examples/server.py`.
Implements the wire described in `references/hosted-example.md`.

The local references emit submissions to stdout (or a drop-directory); this
worker stores per-session state in KV and exposes a `GET /<id>/poll` endpoint
so the draining agent can pull new submissions on a cadence it controls.

## Quick start (local)

```sh
cd examples/worker
npm install
npm run dev       # boots Miniflare; no Cloudflare account required
```

In another terminal:

```sh
# Provision a session (PROVISION_TOKEN defaults to "dev" under wrangler dev).
# The example HTML below checks response.ok before showing success — without
# that, a 4xx (e.g. CSRF rejection, wrong URL) still resolves the fetch
# promise and the surface would falsely report "sent".
curl -s -X POST http://127.0.0.1:8787/_provision \
  -H 'authorization: Bearer dev' \
  -H 'content-type: application/json' \
  -d '{"html":"<html><body><button id=b onclick=\"(async()=>{const r=await fetch(\\\"./submit\\\",{method:\\\"POST\\\",headers:{\\\"content-type\\\":\\\"application/json\\\",\\\"x-poke-csrf\\\":window.POKE_CSRF_TOKEN},body:JSON.stringify({id:\\\"abc\\\",payload:null})});if(!r.ok){document.body.textContent=\\\"submit failed (\\\"+r.status+\\\")\\\";return;}document.body.textContent=\\\"ok\\\";})()\">click</button></body></html>","affordances":{"abc":{"label":"Click","intent":"clicked"}}}'

# -> {"session_id":"...","url":"http://127.0.0.1:8787/<id>/","csrf_token":"..."}
# The URL ends in a trailing slash; that's the canonical form so relative
# fetches like fetch('./submit') resolve to /<id>/submit. Visiting the
# bare /<id> form 308-redirects to /<id>/.

# Open the URL in a browser, click, then drain:
curl -s "http://127.0.0.1:8787/<id>/poll?since=0"
```

## Deploy

```sh
# One-time: create the KV namespace and put its id in wrangler.toml.
wrangler kv namespace create POKE_STATE

# One-time: set the provisioning shared secret.
wrangler secret put PROVISION_TOKEN

# Push to *.workers.dev:
wrangler deploy
```

`wrangler deploy` prints the deployed URL. Use that as the base in the curl
commands above. The reference deployment binds the custom domain
`poke.aac.media` (see `routes` in `wrangler.toml`); the `*.workers.dev`
fallback stays live for direct addressing.

KV puts include `expirationTtl` (30 days, refreshed on each write) so
session state self-cleans without a sweeper. Tunable via the
`SESSION_TTL_SECONDS` constant in `src/index.ts`.

## File map

| File | Purpose |
|---|---|
| `src/index.ts` | The worker. Routes: `GET /` (404 — no landing page), `POST /_provision`, `GET /<id>` (308 → `/<id>/`), `GET /<id>/`, `POST /<id>/submit`, `GET /<id>/poll`, `POST /<id>/upload` (501 stub). |
| `wrangler.toml` | Worker name, KV binding, compatibility date. |
| `tsconfig.json` | TypeScript config targeting Workers runtime. |
| `package.json` | `wrangler` + `@cloudflare/workers-types` devDeps. |

## What this implements vs the local wire

| Local wire | Hosted wire |
|---|---|
| `GET /` → agent-rendered HTML | `GET /<id>/` → agent-rendered HTML (HTML lives in KV per session; bare `/<id>` 308s to the canonical trailing-slash form) |
| `POST /submit` → JSON or multipart | `POST /<id>/submit` → JSON only; multipart is 501 in v0 |
| Drain via `SUBMIT` stdout line (or fs drop-dir) | Drain via `GET /<id>/poll?since=<unix-ms>` |
| State on local disk (`.poke-state.json`) | State in KV (`session:<id>:state`) |
| Loopback bind is the access control | Unguessable session ID is the access control; CSRF on POST |

Multipart uploads are deliberately out of scope for the worker v0 — KV doesn't
fit binary blobs cleanly and R2 adds complexity. See
`references/hosted-example.md` for the rationale and the v2 follow-up.
