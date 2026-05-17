"""Tests for examples/server.py — Python reference of the poke wire.

Runnable as:

    python3 -m unittest examples.test_server
    python3 examples/test_server.py

The tests spin a real ThreadingHTTPServer on 127.0.0.1:0, hit it with
urllib, and assert against the state file and captured stdout. This is
end-to-end enough to catch wire-contract drift the way the Go reference's
httptest-based tests do — and exercises the threaded server stack rather
than mocking out the handler.

The handler writes SUBMIT lines via `sys.stdout.write`, so we monkey-patch
`server._record`'s stdout target by reassigning `sys.stdout` to a StringIO
inside `_record`'s lock window. Cleaner approach: swap `sys.stdout` once,
but then the test runner's own output goes through it too — instead we
patch the module's `sys.stdout` reference directly during the request.
"""

from __future__ import annotations

import io
import json
import os
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
import uuid

# Make examples/ importable when running this file directly (without -m).
_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
if _THIS_DIR not in sys.path:
    sys.path.insert(0, _THIS_DIR)

import server  # noqa: E402  (path-mangling above)


# ---------------------------------------------------------------------------
# Test infrastructure
# ---------------------------------------------------------------------------


class _RunningServer:
    """Context manager that spins server.build_server on an ephemeral port.

    Exposes .base_url so tests can hit it with urllib.
    """

    def __init__(self, state_path: str, html_path: str):
        self.state_path = state_path
        self.html_path = html_path
        self._server: server.ThreadingHTTPServer | None = None
        self._thread: threading.Thread | None = None
        self.base_url: str = ""

    def __enter__(self) -> "_RunningServer":
        srv = server.build_server("127.0.0.1", 0, self.state_path, self.html_path)
        port = srv.server_address[1]
        self._server = srv
        self._thread = threading.Thread(target=srv.serve_forever, daemon=True)
        self._thread.start()
        self.base_url = f"http://127.0.0.1:{port}"
        return self

    def __exit__(self, *exc) -> None:
        if self._server is not None:
            self._server.shutdown()
            self._server.server_close()
        if self._thread is not None:
            self._thread.join(timeout=2)


class _CapturedStdout:
    """Swap `server.sys.stdout` for a StringIO so SUBMIT lines are captured.

    server.py writes via `sys.stdout.write` / `sys.stdout.flush`, looking up
    `sys.stdout` through the `sys` module's attribute each time. Patching
    `sys.stdout` directly is the simplest way to intercept those writes
    without changing the server's code.
    """

    def __init__(self) -> None:
        self.buffer = io.StringIO()
        self._saved = None

    def __enter__(self) -> "_CapturedStdout":
        self._saved = sys.stdout
        sys.stdout = self.buffer
        return self

    def __exit__(self, *exc) -> None:
        sys.stdout = self._saved

    def value(self) -> str:
        return self.buffer.getvalue()


def _initial_state(affordances: dict | None = None) -> str:
    return json.dumps({
        "session_id": f"test-{uuid.uuid4().hex[:8]}",
        "affordances": affordances or {},
        "submissions": [],
    })


def _write_temp(content: str, suffix: str) -> str:
    fd, path = tempfile.mkstemp(suffix=suffix, prefix="poke-test-")
    with os.fdopen(fd, "w") as fh:
        fh.write(content)
    return path


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class ServerServesHTMLTest(unittest.TestCase):
    def test_html_served_with_cache_control(self):
        html_path = _write_temp("<html><body>hello poke</body></html>", ".html")
        state_path = _write_temp(_initial_state(), ".json")
        self.addCleanup(os.remove, html_path)
        self.addCleanup(os.remove, state_path)

        with _RunningServer(state_path, html_path) as srv:
            with urllib.request.urlopen(srv.base_url + "/", timeout=2) as resp:
                self.assertEqual(resp.status, 200)
                body = resp.read().decode("utf-8")
                cache_control = resp.headers.get("Cache-Control", "")

        self.assertIn("hello poke", body)
        # Mirrors the Go reference's act-0ddb fix: surfaces should not be
        # cached because port-reuse + cached tab is a footgun.
        self.assertIn("no-store", cache_control)
        self.assertIn("must-revalidate", cache_control)


class SubmitJSONTest(unittest.TestCase):
    def test_json_submit_appends_state_and_emits_stdout(self):
        html_path = _write_temp("<html></html>", ".html")
        state_path = _write_temp(
            _initial_state({"abc": {"label": "Yes", "intent": "yes"}}), ".json"
        )
        self.addCleanup(os.remove, html_path)
        self.addCleanup(os.remove, state_path)

        with _RunningServer(state_path, html_path) as srv, _CapturedStdout() as cap:
            req = urllib.request.Request(
                srv.base_url + "/submit",
                data=b'{"id":"abc","payload":null}',
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=2) as resp:
                self.assertEqual(resp.status, 200)
            # _record writes inside the request thread; by the time
            # urlopen returns the SUBMIT line is already flushed.
            out = cap.value()

        # Stdout shape per shared contract: "SUBMIT <id> <payload-json>".
        self.assertTrue(
            out.startswith("SUBMIT abc "),
            f"stdout did not start with SUBMIT abc: {out!r}",
        )
        # Payload portion parses as JSON (and equals JSON null here).
        head, _, tail = out.strip().partition(" ")
        _, _, payload_json = tail.partition(" ")
        self.assertEqual(head, "SUBMIT")
        self.assertEqual(json.loads(payload_json), None)

        # State file records the submission with the locked schema.
        with open(state_path) as fh:
            state = json.load(fh)
        self.assertEqual(len(state["submissions"]), 1)
        entry = state["submissions"][0]
        self.assertEqual(entry["id"], "abc")
        self.assertIsNone(entry["payload"])
        self.assertIn("at", entry)
        self.assertTrue(isinstance(entry["at"], str) and entry["at"])

    def test_json_submit_missing_id_returns_400(self):
        html_path = _write_temp("<html></html>", ".html")
        state_path = _write_temp(_initial_state(), ".json")
        self.addCleanup(os.remove, html_path)
        self.addCleanup(os.remove, state_path)

        with _RunningServer(state_path, html_path) as srv:
            req = urllib.request.Request(
                srv.base_url + "/submit",
                data=b'{"payload":null}',
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with self.assertRaises(urllib.error.HTTPError) as ctx:
                urllib.request.urlopen(req, timeout=2)
        self.assertEqual(ctx.exception.code, 400)


class SubmitMultipartTest(unittest.TestCase):
    def _build_multipart(self, fields: dict[str, str], files: list[tuple[str, str, bytes]]):
        """Tiny multipart builder so we don't reach for a heavy dependency.

        Returns (body, content_type). Boundary is fixed for readability —
        nothing else in the request body contains it.
        """
        boundary = "----pokeTestBoundary" + uuid.uuid4().hex[:8]
        crlf = b"\r\n"
        chunks: list[bytes] = []
        for name, value in fields.items():
            chunks.append(f"--{boundary}".encode("ascii"))
            chunks.append(
                f'Content-Disposition: form-data; name="{name}"'.encode("ascii")
            )
            chunks.append(b"")
            chunks.append(value.encode("utf-8"))
        for field_name, filename, data in files:
            chunks.append(f"--{boundary}".encode("ascii"))
            chunks.append(
                (
                    f'Content-Disposition: form-data; name="{field_name}"; '
                    f'filename="{filename}"'
                ).encode("ascii")
            )
            chunks.append(b"Content-Type: application/octet-stream")
            chunks.append(b"")
            chunks.append(data)
        chunks.append(f"--{boundary}--".encode("ascii"))
        chunks.append(b"")
        body = crlf.join(chunks)
        return body, f"multipart/form-data; boundary={boundary}"

    def test_multipart_submit_stores_file_and_emits_stdout(self):
        html_path = _write_temp("<html></html>", ".html")
        state_path = _write_temp(
            _initial_state({"upload-btn": {"label": "Upload", "intent": "upload"}}),
            ".json",
        )
        self.addCleanup(os.remove, html_path)
        self.addCleanup(os.remove, state_path)

        want_bytes = b"hello bytes"
        body, ctype = self._build_multipart(
            {"id": "upload-btn"},
            [("upload", "greeting.txt", want_bytes)],
        )

        with _RunningServer(state_path, html_path) as srv, _CapturedStdout() as cap:
            req = urllib.request.Request(
                srv.base_url + "/submit",
                data=body,
                headers={"Content-Type": ctype},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=2) as resp:
                self.assertEqual(resp.status, 200)
            out = cap.value().strip()

        # SUBMIT line shape: id + JSON-object payload with files[].
        self.assertTrue(
            out.startswith("SUBMIT upload-btn "),
            f"stdout missing expected SUBMIT line: {out!r}",
        )
        _, _, payload_json = out.partition(" upload-btn ")
        payload = json.loads(payload_json)
        self.assertIn("files", payload)
        self.assertIsInstance(payload["files"], list)
        self.assertEqual(len(payload["files"]), 1)
        stored_path = payload["files"][0]
        self.assertTrue(os.path.isabs(stored_path), f"not absolute: {stored_path}")
        self.addCleanup(lambda: os.remove(stored_path) if os.path.exists(stored_path) else None)

        # File on disk matches the bytes we sent.
        with open(stored_path, "rb") as fh:
            self.assertEqual(fh.read(), want_bytes)

        # State file recorded the submission with the same payload shape.
        with open(state_path) as fh:
            state = json.load(fh)
        self.assertEqual(len(state["submissions"]), 1)
        recorded = state["submissions"][0]
        self.assertEqual(recorded["id"], "upload-btn")
        self.assertEqual(recorded["payload"]["files"], [stored_path])

    def test_multipart_submit_empty_files_serializes_as_empty_list(self):
        """Per the Task 7 / act-0cd3 fix: `files` must be [] not null when empty."""
        html_path = _write_temp("<html></html>", ".html")
        state_path = _write_temp(
            _initial_state({"btn": {"label": "Click", "intent": "click"}}),
            ".json",
        )
        self.addCleanup(os.remove, html_path)
        self.addCleanup(os.remove, state_path)

        # Multipart body with only an id field, no file parts at all.
        body, ctype = self._build_multipart({"id": "btn"}, files=[])

        with _RunningServer(state_path, html_path) as srv, _CapturedStdout() as cap:
            req = urllib.request.Request(
                srv.base_url + "/submit",
                data=body,
                headers={"Content-Type": ctype},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=2) as resp:
                self.assertEqual(resp.status, 200)
            out = cap.value().strip()

        # Stdout payload: {"files":[]} — empty list, not null.
        _, _, payload_json = out.partition(" btn ")
        payload = json.loads(payload_json)
        self.assertEqual(payload, {"files": []})
        # And critically: the JSON serialization is `[]`, not `null`.
        self.assertIn('"files":[]', payload_json)

        # State file mirrors the same payload shape.
        with open(state_path) as fh:
            state = json.load(fh)
        self.assertEqual(state["submissions"][0]["payload"], {"files": []})

    def test_multipart_submit_with_extra_form_fields(self):
        """Non-id text fields ride through as additional payload keys."""
        html_path = _write_temp("<html></html>", ".html")
        state_path = _write_temp(
            _initial_state({"feedback": {"label": "Send", "intent": "feedback"}}),
            ".json",
        )
        self.addCleanup(os.remove, html_path)
        self.addCleanup(os.remove, state_path)

        body, ctype = self._build_multipart(
            {"id": "feedback", "comment": "looks good"},
            files=[],
        )

        with _RunningServer(state_path, html_path) as srv, _CapturedStdout() as cap:
            req = urllib.request.Request(
                srv.base_url + "/submit",
                data=body,
                headers={"Content-Type": ctype},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=2) as resp:
                self.assertEqual(resp.status, 200)
            out = cap.value().strip()

        _, _, payload_json = out.partition(" feedback ")
        payload = json.loads(payload_json)
        self.assertEqual(payload.get("files"), [])
        self.assertEqual(payload.get("comment"), "looks good")


# ---------------------------------------------------------------------------
# Direct-run convenience
# ---------------------------------------------------------------------------


if __name__ == "__main__":
    unittest.main(verbosity=2)
