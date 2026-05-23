"""Reference surface server (Python).

Implements the HTTP+JSON wire described in ``references/wire-example.md``:

* ``GET /`` returns the agent-rendered HTML for the current session.
* ``POST /submit`` accepts ``application/json`` or ``multipart/form-data``,
  appends a submission to the state file (atomic rename), and emits exactly
  one ``SUBMIT <id> <payload-json>`` line to stdout.

This is one substrate; the pattern in ``references/pattern.md`` is what's
normative. Other operational choices (port, bind, watchdog, headers) are
implementer's calls — this file picks Python-idiomatic defaults rather than
mirroring any other reference implementation.
"""

from __future__ import annotations

import argparse
import email
import io
import json
import os
import re
import secrets
import sys
import tempfile
import threading
from dataclasses import dataclass
from datetime import datetime, timezone
from email.parser import BytesParser
from email.policy import default as default_policy
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

# Hard cap on submission body size. Multipart uploads above this return 413;
# JSON above this returns 413 too. Ephemeral surfaces rarely need more.
MAX_BODY_BYTES = 32 * 1024 * 1024  # 32 MiB

# Where to store uploaded files. The wire contract requires "any absolute path
# the agent can read back"; the references suggest a shared ``surface-uploads``
# directory under tempdir, which is what we use.
UPLOAD_DIR = Path(tempfile.gettempdir()) / "surface-uploads"

# Filenames coming off the wire are not trusted; we strip everything except
# a small alphabet to keep the on-disk basename sane.
_SAFE_BASENAME = re.compile(r"[^A-Za-z0-9._-]")


@dataclass
class ServerConfig:
    """Runtime configuration for one surface session.

    ``state_path`` and ``html_path`` are the two files the agent owns; the
    server only reads from ``html_path`` and atomically rewrites
    ``state_path`` on each submission.
    """

    state_path: Path
    html_path: Path
    bind: str = "127.0.0.1"
    port: int = 8000


def _rfc3339_now() -> str:
    """Return the current UTC time as an RFC3339 string with microseconds."""
    return datetime.now(timezone.utc).isoformat(timespec="microseconds").replace(
        "+00:00", "Z"
    )


def _sanitize_basename(name: str) -> str:
    """Reduce an uploaded filename to a safe basename.

    Strips any directory components and replaces unsafe characters with ``_``.
    Empty results fall back to ``"upload"``.
    """
    base = Path(name).name or "upload"
    safe = _SAFE_BASENAME.sub("_", base)
    return safe or "upload"


def _atomic_write_json(path: Path, payload: Any) -> None:
    """Serialize ``payload`` to JSON and rename it over ``path``.

    Crash durability (fsync before rename) is intentionally not enforced —
    surface state is ephemeral, and the wire contract names rename-atomicity as
    the requirement.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(
        prefix=path.name + ".", suffix=".tmp", dir=str(path.parent)
    )
    tmp_path = Path(tmp_name)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(payload, fh, indent=2)
            fh.write("\n")
        os.replace(tmp_path, path)
    except Exception:
        tmp_path.unlink(missing_ok=True)
        raise


def _payload_json(payload: Any) -> str:
    """Serialize a payload to a single-line JSON string for the SUBMIT line."""
    return json.dumps(payload, separators=(",", ":"), ensure_ascii=False)


def _parse_multipart(body: bytes, content_type: str) -> tuple[dict[str, str], list[tuple[str, bytes]]]:
    """Parse a multipart/form-data body.

    Returns ``(text_fields, file_fields)``. ``text_fields`` maps field names
    to their decoded string value; ``file_fields`` is a list of
    ``(filename, bytes)`` pairs from parts that had a ``filename=`` attribute.

    Uses ``email.parser`` rather than ``cgi.FieldStorage`` (which is gone in
    Python 3.13) and rather than a third-party library (stdlib is enough).
    """
    # email.parser wants a full MIME message — synthesize one by prepending the
    # Content-Type header.
    header = f"Content-Type: {content_type}\r\nMIME-Version: 1.0\r\n\r\n".encode()
    msg = BytesParser(policy=default_policy).parsebytes(header + body)
    if not msg.is_multipart():
        raise ValueError("body is not multipart")

    text_fields: dict[str, str] = {}
    file_fields: list[tuple[str, bytes]] = []
    for part in msg.iter_parts():
        disposition = part.get("Content-Disposition", "")
        if not disposition:
            continue
        params = part.get_params(header="content-disposition") or []
        name = next((v for k, v in params if k == "name"), None)
        filename = next((v for k, v in params if k == "filename"), None)
        if name is None:
            continue
        if filename is not None:
            payload = part.get_payload(decode=True) or b""
            file_fields.append((filename, payload))
        else:
            payload = part.get_payload(decode=True)
            if payload is None:
                text_fields[name] = ""
            else:
                charset = part.get_content_charset() or "utf-8"
                try:
                    text_fields[name] = payload.decode(charset)
                except (LookupError, UnicodeDecodeError):
                    text_fields[name] = payload.decode("utf-8", errors="replace")
    return text_fields, file_fields


def _store_uploads(file_fields: list[tuple[str, bytes]], upload_dir: Path) -> list[str]:
    """Write uploaded files to disk and return their absolute paths."""
    if not file_fields:
        return []
    upload_dir.mkdir(parents=True, exist_ok=True)
    paths: list[str] = []
    for filename, data in file_fields:
        safe = _sanitize_basename(filename)
        token = secrets.token_hex(8)
        dest = upload_dir / f"{token}-{safe}"
        dest.write_bytes(data)
        paths.append(str(dest.resolve()))
    return paths


class SurfaceServer(ThreadingHTTPServer):
    """Threading HTTP server that carries the per-session config."""

    daemon_threads = True
    allow_reuse_address = True

    def __init__(
        self,
        config: ServerConfig,
        upload_dir: Path = UPLOAD_DIR,
        stdout: io.TextIOBase | None = None,
    ):
        self.config = config
        self.upload_dir = upload_dir
        # Tests and callers may want submissions emitted somewhere other than
        # the process's real stdout.
        self.stdout = stdout if stdout is not None else sys.stdout
        self._state_lock = threading.Lock()
        super().__init__((config.bind, config.port), SurfaceHandler)

    def append_submission(self, entry: dict[str, Any]) -> None:
        """Append a submission entry to the state file under a lock."""
        with self._state_lock:
            with self.config.state_path.open("r", encoding="utf-8") as fh:
                state = json.load(fh)
            state.setdefault("submissions", []).append(entry)
            _atomic_write_json(self.config.state_path, state)

    def emit_submit_line(self, affordance_id: str, payload: Any) -> None:
        """Write the canonical ``SUBMIT <id> <payload-json>`` line to stdout."""
        line = f"SUBMIT {affordance_id} {_payload_json(payload)}\n"
        self.stdout.write(line)
        self.stdout.flush()


class SurfaceHandler(BaseHTTPRequestHandler):
    """Handler for ``GET /``, ``POST /submit``, and ``GET /static/<path>``."""

    server: SurfaceServer  # for typing

    # ----- HTTP plumbing ----------------------------------------------------

    def log_message(self, format: str, *args: Any) -> None:  # noqa: A002
        # Quiet the default access log; the agent only cares about SUBMIT
        # lines. Errors still surface through send_error's body.
        return

    def _send_text(self, status: HTTPStatus, body: str) -> None:
        payload = body.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _send_empty(self, status: HTTPStatus) -> None:
        self.send_response(status)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def _read_body(self) -> bytes | None:
        """Read the request body, enforcing the size cap.

        Returns ``None`` if the body exceeds the cap (and writes a 413
        response); otherwise returns the bytes.
        """
        length_raw = self.headers.get("Content-Length")
        if length_raw is None:
            self._send_text(HTTPStatus.LENGTH_REQUIRED, "Content-Length required")
            return None
        try:
            length = int(length_raw)
        except ValueError:
            self._send_text(HTTPStatus.BAD_REQUEST, "invalid Content-Length")
            return None
        if length < 0:
            self._send_text(HTTPStatus.BAD_REQUEST, "negative Content-Length")
            return None
        if length > MAX_BODY_BYTES:
            self._send_text(
                HTTPStatus.REQUEST_ENTITY_TOO_LARGE,
                f"body exceeds {MAX_BODY_BYTES} bytes",
            )
            return None
        return self.rfile.read(length)

    # ----- Routes -----------------------------------------------------------

    def do_GET(self) -> None:  # noqa: N802 (stdlib convention)
        if self.path == "/" or self.path == "/index.html":
            self._serve_html()
            return
        if self.path.startswith("/static/"):
            self._serve_static(self.path[len("/static/"):])
            return
        self._send_text(HTTPStatus.NOT_FOUND, "not found")

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/submit":
            self._send_text(HTTPStatus.NOT_FOUND, "not found")
            return
        content_type = self.headers.get("Content-Type", "").strip()
        media_type = content_type.split(";", 1)[0].strip().lower()
        if media_type == "application/json":
            self._handle_json_submit()
        elif media_type == "multipart/form-data":
            self._handle_multipart_submit(content_type)
        else:
            self._send_text(
                HTTPStatus.UNSUPPORTED_MEDIA_TYPE,
                f"unsupported content type: {media_type or 'unset'}",
            )

    # ----- GET / and /static -----------------------------------------------

    def _serve_html(self) -> None:
        html_path = self.server.config.html_path
        try:
            data = html_path.read_bytes()
        except FileNotFoundError:
            self._send_text(HTTPStatus.NOT_FOUND, "html not found")
            return
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        # The references note port-reuse hazards: cached browser tabs against
        # a recycled port can interact with the wrong surface. no-store is
        # cheap and avoids that footgun.
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def _serve_static(self, rel: str) -> None:
        # The static route is optional in the wire example; we serve files
        # next to the HTML doc if the agent put them there.
        if not rel or ".." in rel.split("/"):
            self._send_text(HTTPStatus.NOT_FOUND, "not found")
            return
        candidate = (self.server.config.html_path.parent / rel).resolve()
        try:
            candidate.relative_to(self.server.config.html_path.parent.resolve())
        except ValueError:
            self._send_text(HTTPStatus.NOT_FOUND, "not found")
            return
        if not candidate.is_file():
            self._send_text(HTTPStatus.NOT_FOUND, "not found")
            return
        data = candidate.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    # ----- POST /submit -----------------------------------------------------

    def _handle_json_submit(self) -> None:
        body = self._read_body()
        if body is None:
            return
        try:
            parsed = json.loads(body.decode("utf-8") or "null")
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            self._send_text(HTTPStatus.BAD_REQUEST, f"invalid json: {exc}")
            return
        if not isinstance(parsed, dict):
            self._send_text(HTTPStatus.BAD_REQUEST, "body must be a JSON object")
            return
        affordance_id = parsed.get("id")
        if not isinstance(affordance_id, str) or not affordance_id:
            self._send_text(HTTPStatus.BAD_REQUEST, "missing id")
            return
        # A missing payload key normalizes to null per the wire contract.
        payload: Any = parsed.get("payload", None)
        self._record_submission(affordance_id, payload)

    def _handle_multipart_submit(self, content_type: str) -> None:
        body = self._read_body()
        if body is None:
            return
        try:
            text_fields, file_fields = _parse_multipart(body, content_type)
        except (ValueError, email.errors.MessageParseError) as exc:
            self._send_text(HTTPStatus.BAD_REQUEST, f"invalid multipart: {exc}")
            return
        affordance_id = text_fields.pop("id", None)
        if not affordance_id:
            self._send_text(HTTPStatus.BAD_REQUEST, "missing id field")
            return
        try:
            paths = _store_uploads(file_fields, self.server.upload_dir)
        except OSError as exc:
            self._send_text(
                HTTPStatus.INTERNAL_SERVER_ERROR,
                f"could not write upload: {exc}",
            )
            return
        payload: dict[str, Any] = {"files": paths}
        # Extra form fields ride alongside ``files`` per wire-example.md.
        payload.update(text_fields)
        self._record_submission(affordance_id, payload)

    def _record_submission(self, affordance_id: str, payload: Any) -> None:
        entry = {"id": affordance_id, "payload": payload, "at": _rfc3339_now()}
        try:
            self.server.append_submission(entry)
        except FileNotFoundError:
            self._send_text(HTTPStatus.INTERNAL_SERVER_ERROR, "state file missing")
            return
        except (OSError, json.JSONDecodeError) as exc:
            self._send_text(
                HTTPStatus.INTERNAL_SERVER_ERROR,
                f"could not update state: {exc}",
            )
            return
        self.server.emit_submit_line(affordance_id, payload)
        self._send_empty(HTTPStatus.OK)


# ----- CLI -----------------------------------------------------------------


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Run a surface reference server for one session.",
    )
    parser.add_argument(
        "--state",
        required=True,
        type=Path,
        help="path to the JSON state file (created by the agent)",
    )
    parser.add_argument(
        "--html",
        required=True,
        type=Path,
        help="path to the HTML document served at GET /",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=8000,
        help="TCP port to bind (default: 8000)",
    )
    parser.add_argument(
        "--bind",
        default="127.0.0.1",
        help="address to bind (default: 127.0.0.1, loopback)",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
    if not args.state.is_file():
        print(f"state file not found: {args.state}", file=sys.stderr)
        return 2
    if not args.html.is_file():
        print(f"html file not found: {args.html}", file=sys.stderr)
        return 2
    config = ServerConfig(
        state_path=args.state.resolve(),
        html_path=args.html.resolve(),
        bind=args.bind,
        port=args.port,
    )
    server = SurfaceServer(config)
    print(
        f"surface server listening on http://{config.bind}:{config.port}/",
        file=sys.stderr,
    )
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
