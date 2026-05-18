"""Wire-contract tests for the Python poke reference server.

These exercise the wire described in ``references/wire-example.md``:

* state schema (session_id / affordances / submissions, RFC3339 timestamp)
* SUBMIT line format (one line per submission, splits on first two spaces,
  payload is single-line JSON)
* JSON submit (missing payload normalizes to null)
* multipart submit (files land on disk; payload carries absolute paths)
* unsupported content types are rejected
* HTML and static assets are served

They do NOT pin operational details that are implementer's call (port,
header text, error-code choices that aren't load-bearing). Run with
``python -m unittest examples.test_server`` from the repo root or
``python -m unittest`` from inside ``examples/``.
"""

from __future__ import annotations

import http.client
import io
import json
import os
import re
import socket
import sys
import tempfile
import threading
import unittest
import urllib.request
from pathlib import Path

# Make the sibling module importable when run as ``python -m unittest`` from
# either the repo root or this directory.
sys.path.insert(0, str(Path(__file__).resolve().parent))

import server  # noqa: E402


def _free_port() -> int:
    """Return an unused TCP port on the loopback interface."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


RFC3339_RE = re.compile(
    r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$"
)


class WireContractTests(unittest.TestCase):
    """End-to-end tests against a live PokeServer on loopback."""

    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name)
        self.state_path = root / "state.json"
        self.html_path = root / "page.html"
        self.upload_dir = root / "uploads"
        self.html_path.write_text(
            "<!doctype html><html><body><p>hi</p></body></html>",
            encoding="utf-8",
        )
        self.state_path.write_text(
            json.dumps(
                {
                    "session_id": "s_test",
                    "affordances": {
                        "abc123": {"label": "Approve", "intent": "approve"},
                        "def456": {"label": "Upload", "intent": "ingest_file"},
                    },
                    "submissions": [],
                }
            ),
            encoding="utf-8",
        )

        self.captured_stdout = io.StringIO()
        port = _free_port()
        self.config = server.ServerConfig(
            state_path=self.state_path,
            html_path=self.html_path,
            bind="127.0.0.1",
            port=port,
        )
        self.server = server.PokeServer(
            self.config,
            upload_dir=self.upload_dir,
            stdout=self.captured_stdout,
        )
        self.base_url = f"http://127.0.0.1:{port}"
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self._stop_server)

    def _stop_server(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)

    # ----- helpers ----------------------------------------------------------

    def _conn(self) -> http.client.HTTPConnection:
        return http.client.HTTPConnection("127.0.0.1", self.config.port, timeout=2)

    def _read_state(self) -> dict:
        return json.loads(self.state_path.read_text(encoding="utf-8"))

    def _submit_lines(self) -> list[str]:
        return [
            line for line in self.captured_stdout.getvalue().splitlines() if line
        ]

    # ----- GET / and /static -----------------------------------------------

    def test_root_serves_html(self) -> None:
        with urllib.request.urlopen(self.base_url + "/", timeout=2) as resp:
            self.assertEqual(resp.status, 200)
            body = resp.read().decode("utf-8")
            self.assertIn("<!doctype html>", body)
            self.assertEqual(
                resp.headers.get("Content-Type"), "text/html; charset=utf-8"
            )

    def test_static_serves_sibling_file(self) -> None:
        (self.html_path.parent / "style.css").write_text(
            "body{color:red}", encoding="utf-8"
        )
        with urllib.request.urlopen(
            self.base_url + "/static/style.css", timeout=2
        ) as resp:
            self.assertEqual(resp.status, 200)
            self.assertEqual(resp.read(), b"body{color:red}")

    def test_static_rejects_path_traversal(self) -> None:
        conn = self._conn()
        conn.request("GET", "/static/../page.html")
        resp = conn.getresponse()
        self.assertEqual(resp.status, 404)

    def test_unknown_path_404s(self) -> None:
        conn = self._conn()
        conn.request("GET", "/nope")
        resp = conn.getresponse()
        self.assertEqual(resp.status, 404)

    # ----- POST /submit, JSON ----------------------------------------------

    def test_json_submit_appends_and_emits(self) -> None:
        body = json.dumps({"id": "abc123", "payload": {"k": "v"}}).encode("utf-8")
        conn = self._conn()
        conn.request(
            "POST",
            "/submit",
            body=body,
            headers={"Content-Type": "application/json"},
        )
        resp = conn.getresponse()
        self.assertEqual(resp.status, 200)
        self.assertEqual(resp.read(), b"")

        state = self._read_state()
        self.assertEqual(len(state["submissions"]), 1)
        entry = state["submissions"][0]
        self.assertEqual(entry["id"], "abc123")
        self.assertEqual(entry["payload"], {"k": "v"})
        self.assertRegex(entry["at"], RFC3339_RE)

        lines = self._submit_lines()
        self.assertEqual(len(lines), 1)
        prefix, aff_id, payload_json = lines[0].split(" ", 2)
        self.assertEqual(prefix, "SUBMIT")
        self.assertEqual(aff_id, "abc123")
        self.assertEqual(json.loads(payload_json), {"k": "v"})

    def test_json_submit_missing_payload_normalizes_to_null(self) -> None:
        body = json.dumps({"id": "abc123"}).encode("utf-8")
        conn = self._conn()
        conn.request(
            "POST",
            "/submit",
            body=body,
            headers={"Content-Type": "application/json"},
        )
        self.assertEqual(conn.getresponse().status, 200)

        entry = self._read_state()["submissions"][0]
        self.assertIsNone(entry["payload"])
        line = self._submit_lines()[0]
        _, _, payload_json = line.split(" ", 2)
        self.assertEqual(payload_json, "null")

    def test_json_submit_explicit_null_payload(self) -> None:
        body = json.dumps({"id": "abc123", "payload": None}).encode("utf-8")
        conn = self._conn()
        conn.request(
            "POST",
            "/submit",
            body=body,
            headers={"Content-Type": "application/json"},
        )
        self.assertEqual(conn.getresponse().status, 200)
        line = self._submit_lines()[0]
        self.assertEqual(line, "SUBMIT abc123 null")

    def test_submit_line_is_single_line_with_multiline_payload(self) -> None:
        # Payloads containing newlines must JSON-escape so the SUBMIT line
        # stays on one line — the wire's "split on first two spaces"
        # contract depends on it.
        body = json.dumps(
            {"id": "abc123", "payload": {"note": "line one\nline two"}}
        ).encode("utf-8")
        conn = self._conn()
        conn.request(
            "POST",
            "/submit",
            body=body,
            headers={"Content-Type": "application/json"},
        )
        self.assertEqual(conn.getresponse().status, 200)

        emitted = self.captured_stdout.getvalue()
        # Exactly one terminating newline; no embedded newlines from the payload.
        self.assertEqual(emitted.count("\n"), 1)
        line = emitted.rstrip("\n")
        _, _, payload_json = line.split(" ", 2)
        self.assertEqual(
            json.loads(payload_json), {"note": "line one\nline two"}
        )

    def test_json_submit_rejects_missing_id(self) -> None:
        body = json.dumps({"payload": 1}).encode("utf-8")
        conn = self._conn()
        conn.request(
            "POST",
            "/submit",
            body=body,
            headers={"Content-Type": "application/json"},
        )
        self.assertEqual(conn.getresponse().status, 400)
        self.assertEqual(self._read_state()["submissions"], [])

    def test_json_submit_rejects_malformed_body(self) -> None:
        conn = self._conn()
        conn.request(
            "POST",
            "/submit",
            body=b"not-json",
            headers={"Content-Type": "application/json"},
        )
        self.assertEqual(conn.getresponse().status, 400)

    def test_unsupported_content_type_rejected(self) -> None:
        conn = self._conn()
        conn.request(
            "POST",
            "/submit",
            body=b"id=abc123",
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        resp = conn.getresponse()
        # Wire-example.md treats form-urlencoded as unsupported; we return
        # 4xx. Specific status (415) is informational, not pinned.
        self.assertGreaterEqual(resp.status, 400)
        self.assertLess(resp.status, 500)
        self.assertEqual(self._read_state()["submissions"], [])

    # ----- POST /submit, multipart -----------------------------------------

    def _build_multipart(
        self,
        fields: list[tuple[str, str]],
        files: list[tuple[str, str, bytes, str]],
        boundary: str = "----pokeboundary",
    ) -> tuple[bytes, str]:
        """Build a minimal multipart/form-data body.

        ``fields`` is ``[(name, value), ...]``; ``files`` is
        ``[(name, filename, bytes, content_type), ...]``.
        """
        parts: list[bytes] = []
        for name, value in fields:
            parts.append(
                f"--{boundary}\r\n"
                f'Content-Disposition: form-data; name="{name}"\r\n\r\n'
                f"{value}\r\n".encode("utf-8")
            )
        for name, filename, data, ctype in files:
            parts.append(
                (
                    f"--{boundary}\r\n"
                    f'Content-Disposition: form-data; name="{name}"; '
                    f'filename="{filename}"\r\n'
                    f"Content-Type: {ctype}\r\n\r\n"
                ).encode("utf-8")
                + data
                + b"\r\n"
            )
        parts.append(f"--{boundary}--\r\n".encode("utf-8"))
        body = b"".join(parts)
        return body, f"multipart/form-data; boundary={boundary}"

    def test_multipart_submit_stores_file_and_emits(self) -> None:
        body, content_type = self._build_multipart(
            fields=[("id", "def456"), ("note", "hello")],
            files=[("upload", "receipt.txt", b"the-bytes\n", "text/plain")],
        )
        conn = self._conn()
        conn.request("POST", "/submit", body=body, headers={"Content-Type": content_type})
        self.assertEqual(conn.getresponse().status, 200)

        entry = self._read_state()["submissions"][0]
        self.assertEqual(entry["id"], "def456")
        payload = entry["payload"]
        self.assertEqual(payload["note"], "hello")
        self.assertEqual(len(payload["files"]), 1)
        stored = Path(payload["files"][0])
        self.assertTrue(stored.is_absolute())
        self.assertTrue(stored.is_file())
        self.assertEqual(stored.read_bytes(), b"the-bytes\n")

        line = self._submit_lines()[0]
        prefix, aff_id, payload_json = line.split(" ", 2)
        self.assertEqual(prefix, "SUBMIT")
        self.assertEqual(aff_id, "def456")
        emitted_payload = json.loads(payload_json)
        self.assertEqual(emitted_payload["note"], "hello")
        self.assertEqual(emitted_payload["files"], [str(stored)])

    def test_multipart_submit_without_files_has_empty_files_array(self) -> None:
        body, content_type = self._build_multipart(
            fields=[("id", "def456"), ("note", "hi")],
            files=[],
        )
        conn = self._conn()
        conn.request("POST", "/submit", body=body, headers={"Content-Type": content_type})
        self.assertEqual(conn.getresponse().status, 200)
        entry = self._read_state()["submissions"][0]
        self.assertEqual(entry["payload"]["files"], [])
        self.assertEqual(entry["payload"]["note"], "hi")

    def test_multipart_filename_is_sanitized(self) -> None:
        # Path components and odd characters must not escape the upload dir.
        body, content_type = self._build_multipart(
            fields=[("id", "def456")],
            files=[
                (
                    "upload",
                    "../../etc/passwd",
                    b"x",
                    "application/octet-stream",
                )
            ],
        )
        conn = self._conn()
        conn.request("POST", "/submit", body=body, headers={"Content-Type": content_type})
        self.assertEqual(conn.getresponse().status, 200)
        stored = Path(self._read_state()["submissions"][0]["payload"]["files"][0])
        self.assertEqual(stored.parent.resolve(), self.upload_dir.resolve())
        self.assertNotIn("..", stored.name)
        self.assertNotIn("/", stored.name)

    def test_multipart_submit_rejects_missing_id(self) -> None:
        body, content_type = self._build_multipart(
            fields=[("note", "no id")],
            files=[],
        )
        conn = self._conn()
        conn.request("POST", "/submit", body=body, headers={"Content-Type": content_type})
        self.assertEqual(conn.getresponse().status, 400)
        self.assertEqual(self._read_state()["submissions"], [])

    def test_post_to_unknown_path_404s(self) -> None:
        conn = self._conn()
        conn.request(
            "POST",
            "/elsewhere",
            body=b"{}",
            headers={"Content-Type": "application/json"},
        )
        self.assertEqual(conn.getresponse().status, 404)


class UnitTests(unittest.TestCase):
    """Tests for the pure helpers that don't need a live server."""

    def test_rfc3339_now_shape(self) -> None:
        stamp = server._rfc3339_now()
        self.assertRegex(stamp, RFC3339_RE)
        self.assertTrue(stamp.endswith("Z"))

    def test_payload_json_is_single_line(self) -> None:
        out = server._payload_json({"a": 1, "b": "two\nlines"})
        self.assertNotIn("\n", out)
        self.assertEqual(json.loads(out), {"a": 1, "b": "two\nlines"})

    def test_sanitize_basename_strips_directories(self) -> None:
        self.assertEqual(server._sanitize_basename("../../foo.txt"), "foo.txt")
        self.assertEqual(server._sanitize_basename("weird name!.jpg"), "weird_name_.jpg")
        self.assertEqual(server._sanitize_basename(""), "upload")
        self.assertEqual(server._sanitize_basename("/"), "upload")

    def test_atomic_write_json_roundtrip(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "out.json"
            server._atomic_write_json(target, {"hello": "world"})
            self.assertEqual(
                json.loads(target.read_text(encoding="utf-8")),
                {"hello": "world"},
            )
            # Subsequent writes overwrite cleanly and leave no temp files.
            server._atomic_write_json(target, {"hello": "again"})
            self.assertEqual(
                json.loads(target.read_text(encoding="utf-8")),
                {"hello": "again"},
            )
            leftovers = [p for p in Path(tmp).iterdir() if p.name != target.name]
            self.assertEqual(leftovers, [])


if __name__ == "__main__":
    unittest.main()
