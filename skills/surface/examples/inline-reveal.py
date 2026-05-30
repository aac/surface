#!/usr/bin/env python3
"""
inline-reveal.py — minimal surface demonstrating Rule 5: "the surface owns the result"

Rule 5 says: render the result onto the surface itself — inline expansion,
revealed panel, swapped content — not into chat. The /submit POST still fires
so the agent learns the recipient's path, but the recipient-facing answer lives
on the page. If the response bounces to chat, the surface is doing nothing the
chat couldn't.

This example: the agent has three refactoring options it wants the user to
choose between. Each button click POSTs to /submit; the server emits a SUBMIT
line to stdout (so the agent can drain), and the HTTP response body carries the
reveal HTML — which the page swaps into an inline panel. The user sees the
detailed reasoning immediately, on the page, without any chat round-trip.

Usage:
    python3 inline-reveal.py [--port PORT]   # default port 7432

The server emits one line per submission to stdout:
    SUBMIT <affordance-id> <payload-json>

Split on the first two spaces; JSON-parse the remainder to get the payload.
Ctrl-C to stop.
"""

import argparse
import http.server
import json
import os
import secrets
import sys
from datetime import datetime, timezone

# ---------------------------------------------------------------------------
# Surface design: the agent mints affordance IDs and persists intent map.
# ---------------------------------------------------------------------------

def mint_id() -> str:
    return secrets.token_hex(8)

# The agent's intent map: id -> {label, intent, reveal_html}
# "intent" is what the agent does when the agent drains the SUBMIT line.
# "reveal_html" is what the surface shows the recipient — Rule 5 in action.
SESSION_ID = mint_id()

AFFORDANCES: dict[str, dict] = {}

def build_affordances() -> None:
    """Mint IDs and record intent + reveal content for each option."""
    options = [
        {
            "label": "Extract Method",
            "intent": "apply_extract_method_refactor",
            "reveal_html": """
<h3>Extract Method</h3>
<p>Pull the repeated block into its own named function. This is the lowest-risk
refactoring: it does not change observable behavior, git blame stays clean, and
the new name documents intent where a comment would have lived.</p>
<p><strong>Best when:</strong> the block appears 2+ times, or the inline code
is hard to read at a glance. The extracted function becomes independently
testable.</p>
<p class="action">The agent will apply this refactoring to all 4 call sites.</p>
""",
        },
        {
            "label": "Introduce Parameter Object",
            "intent": "apply_parameter_object_refactor",
            "reveal_html": """
<h3>Introduce Parameter Object</h3>
<p>Group the six related arguments into a typed struct. The call sites become
self-documenting and future additions avoid signature churn.</p>
<p><strong>Best when:</strong> the same cluster of arguments travels together
across multiple functions. Reduces coupling between callers who only care about
a subset.</p>
<p class="action">The agent will create the struct, migrate all call sites, and
update the tests.</p>
""",
        },
        {
            "label": "Skip — leave as-is",
            "intent": "skip_refactor",
            "reveal_html": """
<h3>Skip for now</h3>
<p>The code is readable enough and the blast radius isn't worth it before the
upcoming deadline. Filed a follow-up note in the task tracker.</p>
<p class="action">No changes applied. The agent recorded a follow-up.</p>
""",
        },
    ]

    for opt in options:
        aid = mint_id()
        AFFORDANCES[aid] = {
            "label": opt["label"],
            "intent": opt["intent"],
            "reveal_html": opt["reveal_html"],
        }


# ---------------------------------------------------------------------------
# HTML surface — authored by the agent, served at GET /
# ---------------------------------------------------------------------------

def render_surface_html() -> str:
    """Build the page HTML. Affordance IDs are embedded directly."""
    buttons = "\n".join(
        f'<button class="option" onclick="choose(\'{aid}\')">'
        f'{info["label"]}</button>'
        for aid, info in AFFORDANCES.items()
    )

    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Refactoring choice</title>
  <style>
    body {{
      font-family: system-ui, sans-serif;
      max-width: 600px;
      margin: 2rem auto;
      padding: 0 1rem;
      line-height: 1.5;
      color: #1a1a1a;
    }}
    .context {{
      background: #f5f5f5;
      border-left: 3px solid #888;
      padding: 0.75rem 1rem;
      margin-bottom: 1.5rem;
      font-size: 0.9rem;
    }}
    .option {{
      display: block;
      width: 100%;
      padding: 0.75rem 1rem;
      margin: 0.5rem 0;
      font-size: 1rem;
      text-align: left;
      cursor: pointer;
      border: 1px solid #ccc;
      border-radius: 4px;
      background: #fff;
    }}
    .option:hover {{ background: #f0f7ff; border-color: #4a90e2; }}
    .option:disabled {{ opacity: 0.5; cursor: default; }}
    #reveal {{
      margin-top: 2rem;
      padding: 1rem 1.25rem;
      border: 1px solid #4a90e2;
      border-radius: 4px;
      background: #f0f7ff;
      display: none;
    }}
    #reveal h3 {{ margin-top: 0; }}
    .action {{
      font-style: italic;
      color: #555;
      border-top: 1px solid #cce;
      padding-top: 0.5rem;
      margin-top: 1rem;
    }}
    #status {{
      font-size: 0.85rem;
      color: #888;
      margin-top: 0.5rem;
    }}
  </style>
</head>
<body>
  <h1>Choose a refactoring approach</h1>

  <div class="context">
    <strong>Context:</strong> The <code>processOrder()</code> function has grown
    to 80 lines and is duplicated in three places. Pick the approach you want
    the agent to apply.
  </div>

  <p>Select one — the agent will proceed immediately after your choice.</p>

  {buttons}

  <div id="status"></div>

  <!-- Rule 5: the result panel lives here, on the page, not in chat -->
  <div id="reveal"></div>

  <script>
    async function choose(id) {{
      // Disable all buttons so the user can't submit twice.
      document.querySelectorAll('.option').forEach(b => b.disabled = true);
      document.getElementById('status').textContent = 'Sending…';

      const resp = await fetch('/submit', {{
        method: 'POST',
        headers: {{'Content-Type': 'application/json'}},
        body: JSON.stringify({{id, payload: null}}),
      }});

      if (!resp.ok) {{
        document.getElementById('status').textContent =
          'Error ' + resp.status + ' — try refreshing.';
        document.querySelectorAll('.option').forEach(b => b.disabled = false);
        return;
      }}

      // Rule 5: swap the server's response body into the inline reveal panel.
      // The recipient-facing answer lives on the page — no chat bounce.
      // The reveal HTML is agent-authored (from the AFFORDANCES dict), not
      // recipient-controlled input, so innerHTML is appropriate here.
      // Free-text fields (Rule 2 escape-hatch) would be handled differently.
      const html = await resp.text();
      const panel = document.getElementById('reveal');
      panel.innerHTML = html;
      panel.style.display = 'block';
      document.getElementById('status').textContent = '';
    }}
  </script>
</body>
</html>"""


# ---------------------------------------------------------------------------
# HTTP server
# ---------------------------------------------------------------------------

class SurfaceHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        # Suppress default request logging so stdout is clean for SUBMIT lines.
        pass

    def send_text(self, status: int, body: str, content_type: str = "text/plain") -> None:
        encoded = body.encode()
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def do_GET(self):
        if self.path == "/":
            html = render_surface_html()
            encoded = html.encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(encoded)))
            # Rule 5 depends on the page being current; no stale caches.
            self.send_header("Cache-Control", "no-store, must-revalidate")
            self.end_headers()
            self.wfile.write(encoded)
        else:
            self.send_text(404, "not found")

    def do_POST(self):
        if self.path != "/submit":
            self.send_text(404, "not found")
            return

        ct = self.headers.get("Content-Type", "")
        if not ct.startswith("application/json"):
            self.send_text(415, "unsupported media type — use application/json")
            return

        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length)
        try:
            body = json.loads(raw)
        except json.JSONDecodeError:
            self.send_text(400, "bad json")
            return

        affordance_id = body.get("id", "")
        payload = body.get("payload", None)

        if affordance_id not in AFFORDANCES:
            self.send_text(400, "unknown affordance id")
            return

        # Emit the SUBMIT line — the agent's drain loop reads this.
        # Format: SUBMIT <id> <payload-json> (one line, payload JSON-serialized)
        payload_json = json.dumps(payload)
        print(f"SUBMIT {affordance_id} {payload_json}", flush=True)

        # Rule 5: the HTTP response body carries the reveal content.
        # The page swaps this into the inline panel — no chat bounce.
        reveal_html = AFFORDANCES[affordance_id]["reveal_html"]
        self.send_text(200, reveal_html, content_type="text/html; charset=utf-8")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="inline-reveal surface example")
    parser.add_argument("--port", type=int, default=7432,
                        help="port to listen on (default: 7432)")
    args = parser.parse_args()

    build_affordances()

    # Print the intent map to stderr so it's visible without polluting the
    # SUBMIT line stdout channel the agent drains.
    print(f"session_id: {SESSION_ID}", file=sys.stderr)
    print(f"affordances:", file=sys.stderr)
    for aid, info in AFFORDANCES.items():
        print(f"  {aid}  →  {info['intent']}", file=sys.stderr)
    print(f"\nSurface: http://127.0.0.1:{args.port}/", file=sys.stderr)
    print(f"Drain stdout for SUBMIT lines. Ctrl-C to stop.\n", file=sys.stderr)

    server = http.server.HTTPServer(("127.0.0.1", args.port), SurfaceHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nshutting down", file=sys.stderr)
        server.shutdown()


if __name__ == "__main__":
    main()
