#!/usr/bin/env python3
"""poke reference server — Python sibling of examples/server.go.

Implements the HTTP+JSON wire described in references/wire-example.md.
Python stdlib only (no Flask, no FastAPI, no third-party dependencies).

Usage:

    python3 examples/server.py --state /tmp/poke-state.json \\
        --html /tmp/poke.html [--port 5173] [--bind 127.0.0.1]

One canonical wire for localhost use. Loopback bind by default. Emits one
line per submission to stdout:

    SUBMIT <id> <payload-json>

The wire contract is locked in docs/plan.md "Shared contracts" and mirrored
by examples/server.go; the two reference implementations conform to the same
state schema, stdout format, and submission endpoint.
"""

from __future__ import annotations

import argparse
import json
import os
import secrets
import sys
import tempfile
import threading
import time
from datetime import datetime, timezone
from email import message_from_bytes
from email.policy import default as default_email_policy
from http.server import BaseHTTPRequestHandler, HTTPServer
from socketserver import ThreadingMixIn
from typing import Any

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Cap multipart bodies at 32 MiB — matches the Go reference's
# maxMultipartMemory. Larger bodies are rejected with 413.
MAX_MULTIPART_BYTES = 32 << 20

# Watchdog poll cadence (seconds). Mirrors the Go reference's 500ms tick.
PARENT_POLL_INTERVAL = 0.5

# Path layout for stored uploads:
#   <tempdir>/poke-uploads/<random-hex>-<sanitized-basename>
UPLOAD_SUBDIR = "poke-uploads"


# ---------------------------------------------------------------------------
# State file helpers (atomic write + locking)
# ---------------------------------------------------------------------------


_STATE_LOCK = threading.Lock()


def _atomic_write(path: str, data: bytes) -> None:
    """Write `data` to `path` atomically via tmp-file + os.rename.

    Same shape as the Go reference's atomicWrite: the temp file lives in
    the same directory so rename is atomic on POSIX, and we clean up on
    failure rather than leaking partial files.
    """
    directory = os.path.dirname(os.path.abspath(path)) or "."
    # Use a hidden prefix so partial writes don't look like state files
    # if a glob is run mid-write.
    tmp_name = os.path.join(
        directory, f".poke-state-{secrets.token_hex(4)}.tmp"
    )
    try:
        with open(tmp_name, "wb") as fh:
            fh.write(data)
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(tmp_name, path)
    except Exception:
        # Best-effort cleanup of the tmp file on any failure path.
        try:
            os.remove(tmp_name)
        except OSError:
            pass
        raise


def _record(state_path: str, affordance_id: str, payload: Any) -> None:
    """Append a submission to the state file and emit the SUBMIT stdout line.

    Holds the module-level lock across read-modify-write of the state file
    and the stdout emission so concurrent submissions can't interleave —
    matches the Go reference's coarse sync.Mutex stance.
    """
    with _STATE_LOCK:
        with open(state_path, "rb") as fh:
            state = json.loads(fh.read())

        # Be defensive about missing submissions key — the wire schema
        # requires it but we shouldn't crash if a caller hand-edits state.
        submissions = state.setdefault("submissions", [])
        submissions.append({
            "id": affordance_id,
            "payload": payload,
            "at": _now_rfc3339(),
        })

        # Serialize state with sort_keys=False to keep field order
        # (session_id, affordances, submissions) close to the Go output
        # while staying deterministic enough for tests.
        encoded = json.dumps(state, separators=(",", ":")).encode("utf-8")
        _atomic_write(state_path, encoded)

        # Per the shared contract:
        #   SUBMIT <id> <payload-json>
        # Payload re-serialized compactly on one line.
        payload_json = json.dumps(payload, separators=(",", ":"))
        sys.stdout.write(f"SUBMIT {affordance_id} {payload_json}\n")
        sys.stdout.flush()


def _now_rfc3339() -> str:
    """RFC3339-shaped UTC timestamp with microsecond precision.

    Go's time.RFC3339Nano gives nanoseconds; Python's datetime tops out at
    microseconds. The shared contract calls for "RFC3339Nano" but in
    practice anything RFC3339-shaped (ISO 8601 with timezone) is fine —
    consumers parse with a date library, not lex on digit count.
    """
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


# ---------------------------------------------------------------------------
# Multipart parsing (email.parser, stdlib)
# ---------------------------------------------------------------------------


def _parse_multipart(content_type: str, body: bytes) -> tuple[dict[str, str], list[tuple[str, str, bytes]]]:
    """Parse a multipart/form-data body into (fields, files).

    `fields` maps form-field name -> last text value (matches Go reference's
    "collapse to first value" — but using last is equally valid; the wire
    contract doesn't pin this).
    `files` is a list of (field_name, filename, bytes) tuples in the order
    they appeared in the body.

    Implementation: feed a synthetic MIME document to email.parser. We could
    use the email module's higher-level API, but it expects header-prefixed
    input — easier to wrap the body in a fake Content-Type header so the
    parser sees a complete multipart message.
    """
    # email.parser needs the Content-Type on a header line for it to
    # discover the boundary. Build a stub message: header line + blank
    # line + body bytes. Use the modern `default` policy so we get an
    # EmailMessage (with iter_parts) rather than a compat32 Message.
    synthetic = (
        f"Content-Type: {content_type}\r\n\r\n".encode("ascii") + body
    )
    msg = message_from_bytes(synthetic, policy=default_email_policy)
    if not msg.is_multipart():
        raise ValueError("not a multipart message")

    fields: dict[str, str] = {}
    files: list[tuple[str, str, bytes]] = []

    for part in msg.iter_parts():
        cd = part.get("Content-Disposition", "")
        # Parse Content-Disposition manually — email's get_param is
        # available via the policy but compat32 is the simplest path.
        params = _parse_content_disposition(cd)
        name = params.get("name")
        if not name:
            continue
        filename = params.get("filename")
        if filename is not None:
            files.append((name, filename, part.get_payload(decode=True) or b""))
        else:
            # Text field: decode with the part's charset (default utf-8).
            charset = part.get_content_charset() or "utf-8"
            raw = part.get_payload(decode=True) or b""
            try:
                fields[name] = raw.decode(charset)
            except (UnicodeDecodeError, LookupError):
                fields[name] = raw.decode("utf-8", errors="replace")

    return fields, files


def _parse_content_disposition(header: str) -> dict[str, str]:
    """Tiny Content-Disposition parser yielding the {name, filename} params.

    Sufficient for well-formed multipart/form-data bodies; doesn't try to
    handle RFC 2231 extended encoding (rare in form posts, and the Go
    reference doesn't either).
    """
    out: dict[str, str] = {}
    if not header:
        return out
    # Split on ';' but respect quoted values.
    parts = []
    buf = []
    in_quotes = False
    for ch in header:
        if ch == '"':
            in_quotes = not in_quotes
            buf.append(ch)
        elif ch == ";" and not in_quotes:
            parts.append("".join(buf).strip())
            buf = []
        else:
            buf.append(ch)
    if buf:
        parts.append("".join(buf).strip())

    for p in parts:
        if "=" not in p:
            continue
        k, _, v = p.partition("=")
        k = k.strip().lower()
        v = v.strip()
        if v.startswith('"') and v.endswith('"'):
            v = v[1:-1]
        out[k] = v
    return out


def _save_upload(upload_dir: str, filename: str, data: bytes) -> str:
    """Write one upload to disk with random-hex prefix; return abs path.

    Path shape matches the Go reference:
        <tempdir>/poke-uploads/<random-hex>-<sanitized-basename>
    """
    os.makedirs(upload_dir, exist_ok=True)
    safe = _sanitize_filename(filename)
    # secrets.token_hex(8) -> 16 hex chars; matches crypto/rand 8 bytes
    # encoded in the Go reference.
    name = f"{secrets.token_hex(8)}-{safe}"
    full = os.path.abspath(os.path.join(upload_dir, name))
    # Open with O_EXCL would be safer against the (vanishingly small)
    # nonce-collision case; ordinary 'wb' is consistent with the Go ref.
    with open(full, "wb") as fh:
        fh.write(data)
    return full


def _sanitize_filename(name: str) -> str:
    """Strip path components; fall back to a generic name on empty input."""
    name = os.path.basename(name or "")
    if not name or name in (".", "/", "\\"):
        return "upload"
    return name


# ---------------------------------------------------------------------------
# HTTP handler
# ---------------------------------------------------------------------------


class PokeHandler(BaseHTTPRequestHandler):
    # These get set as class attributes when build_server constructs the
    # handler subclass — cleaner than passing through HTTPServer because
    # BaseHTTPRequestHandler instantiates a fresh handler per request and
    # doesn't have a clean way to pass extra constructor args.
    state_path: str = ""
    html_path: str = ""

    # Silence the default request logger (one line per request to stderr)
    # — the SUBMIT lines on stdout are what consumers care about; the
    # access log is noise for this use case. Mirrors the Go reference's
    # stderr-only "serving …" startup line.
    def log_message(self, format: str, *args: Any) -> None:
        return

    # -- routing --

    def do_GET(self) -> None:
        if self.path == "/":
            self._serve_html()
        else:
            self.send_error(404, "not found")

    def do_POST(self) -> None:
        if self.path == "/submit":
            self._submit()
        else:
            self.send_error(404, "not found")

    # -- handlers --

    def _serve_html(self) -> None:
        try:
            with open(self.html_path, "rb") as fh:
                body = fh.read()
        except OSError as exc:
            self.send_error(500, f"read html: {exc}")
            return
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        # Mirrors the Go reference: guards against stale-tab-on-reused-port.
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.end_headers()
        self.wfile.write(body)

    def _submit(self) -> None:
        ctype = self.headers.get("Content-Type", "")
        # Strip params: "multipart/form-data; boundary=..." -> "multipart/form-data"
        base = ctype.split(";", 1)[0].strip().lower()

        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self.send_error(400, "invalid Content-Length")
            return

        if base == "application/json":
            body = self.rfile.read(length) if length > 0 else b""
            self._submit_json(body)
        elif base == "multipart/form-data":
            if length > MAX_MULTIPART_BYTES:
                self.send_error(413, "multipart too large")
                return
            body = self.rfile.read(length) if length > 0 else b""
            self._submit_multipart(ctype, body)
        else:
            self.send_error(415, "unsupported content type")

    def _submit_json(self, body: bytes) -> None:
        try:
            parsed = json.loads(body.decode("utf-8")) if body else {}
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            self.send_error(400, f"invalid json: {exc}")
            return
        if not isinstance(parsed, dict):
            self.send_error(400, "json body must be object")
            return
        affordance_id = parsed.get("id")
        if not isinstance(affordance_id, str) or not affordance_id:
            self.send_error(400, "missing id")
            return
        # "payload" missing or null both collapse to JSON null — matches
        # the Go reference's RawMessage("null") fallback.
        payload = parsed.get("payload", None)
        try:
            _record(self.state_path, affordance_id, payload)
        except Exception as exc:
            self.send_error(500, f"record: {exc}")
            return
        self.send_response(200)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def _submit_multipart(self, content_type: str, body: bytes) -> None:
        try:
            fields, files = _parse_multipart(content_type, body)
        except Exception as exc:
            self.send_error(400, f"invalid multipart: {exc}")
            return

        affordance_id = fields.get("id", "")
        if not affordance_id:
            self.send_error(400, "missing id")
            return

        # tempfile.gettempdir() honors the platform default (and TMPDIR
        # on POSIX) — matches the spirit of the Go reference's os.TempDir.
        upload_dir = os.path.join(tempfile.gettempdir(), UPLOAD_SUBDIR)

        saved_paths: list[str] = []
        for _field_name, filename, data in files:
            try:
                saved_paths.append(_save_upload(upload_dir, filename, data))
            except OSError as exc:
                self.send_error(500, f"save upload: {exc}")
                return

        # Build payload: files always present (empty list when no files —
        # not None — to match the Go reference's act-0cd3 fix). Other form
        # fields (besides 'id') are copied through as keys.
        payload: dict[str, Any] = {"files": saved_paths}
        for name, value in fields.items():
            if name == "id":
                continue
            payload[name] = value

        try:
            _record(self.state_path, affordance_id, payload)
        except Exception as exc:
            self.send_error(500, f"record: {exc}")
            return
        self.send_response(200)
        self.send_header("Content-Length", "0")
        self.end_headers()


class ThreadingHTTPServer(ThreadingMixIn, HTTPServer):
    # Daemon threads so Ctrl-C / parent-death shutdown doesn't hang on
    # in-flight requests; mirrors what stdlib's http.server.ThreadingHTTPServer
    # does (we redefine to be explicit and keep older 3.x compatibility if
    # ever needed).
    daemon_threads = True
    allow_reuse_address = True


def build_server(bind: str, port: int, state_path: str, html_path: str) -> ThreadingHTTPServer:
    """Construct an HTTPServer with a PokeHandler subclass bound to paths."""
    # Subclass per-instance so the class attributes don't bleed between
    # servers (would matter only in tests; cheap to do).
    class _BoundHandler(PokeHandler):
        pass
    _BoundHandler.state_path = state_path
    _BoundHandler.html_path = html_path
    return ThreadingHTTPServer((bind, port), _BoundHandler)


# ---------------------------------------------------------------------------
# Parent-death watchdog
# ---------------------------------------------------------------------------


def _watch_parent_death(
    server: HTTPServer, original_ppid: int, tick: float = PARENT_POLL_INTERVAL
) -> None:
    """Poll os.getppid(); shut the server down if the parent goes away.

    Mirrors the Go reference's watchParentDeath. When the original parent
    exits the kernel reparents us to init (PID 1 on POSIX); detecting that
    lets the server release the port rather than holding it across sessions.

    Skips the loop when original_ppid <= 1 (we were launched by init —
    rare; nothing useful to watch).
    """
    if original_ppid <= 1:
        return
    while True:
        time.sleep(tick)
        if os.getppid() != original_ppid:
            sys.stderr.write("poke: parent process exited; shutting down\n")
            sys.stderr.flush()
            # server.shutdown() is safe to call from another thread per
            # the http.server docs; serve_forever() returns shortly after.
            server.shutdown()
            return


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="server.py",
        description="poke reference server (Python stdlib, mirrors examples/server.go)",
    )
    parser.add_argument("--state", required=True, help="path to state JSON file")
    parser.add_argument("--html", required=True, help="path to HTML to serve at /")
    parser.add_argument("--port", type=int, default=5173, help="TCP port to listen on")
    parser.add_argument(
        "--bind", default="127.0.0.1", help="address to bind (loopback by default)"
    )
    args = parser.parse_args(argv)

    server = build_server(args.bind, args.port, args.state, args.html)
    sys.stderr.write(
        f"poke: serving {args.html} on http://{args.bind}:{args.port}/ "
        f"(state={args.state})\n"
    )
    sys.stderr.flush()

    # Parent-death watchdog as a daemon thread — same shape as the Go
    # reference's `go watchParentDeath(...)`.
    watchdog = threading.Thread(
        target=_watch_parent_death,
        args=(server, os.getppid(), PARENT_POLL_INTERVAL),
        daemon=True,
    )
    watchdog.start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
