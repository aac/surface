package main

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"mime/multipart"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestServerServesHTML(t *testing.T) {
	htmlFile, err := os.CreateTemp("", "surface-html-*.html")
	if err != nil {
		t.Fatal(err)
	}
	defer os.Remove(htmlFile.Name())
	htmlFile.WriteString("<html><body>hello surface</body></html>")
	htmlFile.Close()

	stateFile, err := os.CreateTemp("", "surface-state-*.json")
	if err != nil {
		t.Fatal(err)
	}
	defer os.Remove(stateFile.Name())
	stateFile.WriteString(`{"session_id":"test","affordances":{},"submissions":[]}`)
	stateFile.Close()

	handler := newHandler(stateFile.Name(), htmlFile.Name())
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
	body, _ := io.ReadAll(rec.Result().Body)
	if !strings.Contains(string(body), "hello surface") {
		t.Fatalf("body did not contain expected HTML: %s", string(body))
	}
	// Cache-Control: no-store guards against the stale-tab-on-reused-port
	// hazard. The exact directives are an implementation choice; the
	// requirement is that browsers be told not to use a cached copy.
	cc := rec.Result().Header.Get("Cache-Control")
	if !strings.Contains(cc, "no-store") {
		t.Fatalf("Cache-Control missing no-store: %q", cc)
	}
}

func TestSubmitAppendsStateAndEmitsStdout(t *testing.T) {
	stateFile, _ := os.CreateTemp("", "surface-state-*.json")
	defer os.Remove(stateFile.Name())
	stateFile.WriteString(`{"session_id":"test","affordances":{"abc":{"label":"Yes","intent":"yes"}},"submissions":[]}`)
	stateFile.Close()

	htmlFile, _ := os.CreateTemp("", "surface-html-*.html")
	defer os.Remove(htmlFile.Name())
	htmlFile.Close()

	// capture stdout
	oldStdout := os.Stdout
	r, w, _ := os.Pipe()
	os.Stdout = w
	t.Cleanup(func() { os.Stdout = oldStdout })

	handler := newHandler(stateFile.Name(), htmlFile.Name())
	req := httptest.NewRequest(http.MethodPost, "/submit",
		strings.NewReader(`{"id":"abc","payload":null}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}

	w.Close()
	out, _ := io.ReadAll(r)
	if !strings.HasPrefix(string(out), "SUBMIT abc ") {
		t.Fatalf("stdout did not emit SUBMIT line: %q", string(out))
	}
	// verify the rest of the line is valid JSON (per shared contract)
	parts := strings.SplitN(strings.TrimSpace(string(out)), " ", 3)
	if len(parts) != 3 {
		t.Fatalf("SUBMIT line malformed: %q", out)
	}
	var payload any
	if err := json.Unmarshal([]byte(parts[2]), &payload); err != nil {
		t.Fatalf("payload not valid JSON: %q (%v)", parts[2], err)
	}

	// verify state file appended
	data, _ := os.ReadFile(stateFile.Name())
	if !strings.Contains(string(data), `"id":"abc"`) {
		t.Fatalf("state file did not record submission: %s", string(data))
	}
}

// TestSubmitRejectsUnsupportedContentType pins the wire-spec requirement that
// non-JSON, non-multipart submissions are rejected with a 4xx — the Go, Node,
// and Rust references all converged on 415 Unsupported Media Type.
func TestSubmitRejectsUnsupportedContentType(t *testing.T) {
	stateFile, _ := os.CreateTemp("", "surface-state-*.json")
	defer os.Remove(stateFile.Name())
	stateFile.WriteString(`{"session_id":"test","affordances":{},"submissions":[]}`)
	stateFile.Close()

	htmlFile, _ := os.CreateTemp("", "surface-html-*.html")
	defer os.Remove(htmlFile.Name())
	htmlFile.Close()

	handler := newHandler(stateFile.Name(), htmlFile.Name())
	req := httptest.NewRequest(http.MethodPost, "/submit",
		strings.NewReader("id=abc"))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnsupportedMediaType {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusUnsupportedMediaType)
	}
}

// TestSubmitJSONMissingIDReturns400 pins the wire-spec requirement that a
// JSON submission without an id is rejected with 400 — without this, the
// state file would accumulate entries whose affordance ID is the empty
// string, which is meaningless to the agent's intent map.
func TestSubmitJSONMissingIDReturns400(t *testing.T) {
	stateFile, _ := os.CreateTemp("", "surface-state-*.json")
	defer os.Remove(stateFile.Name())
	stateFile.WriteString(`{"session_id":"test","affordances":{},"submissions":[]}`)
	stateFile.Close()

	htmlFile, _ := os.CreateTemp("", "surface-html-*.html")
	defer os.Remove(htmlFile.Name())
	htmlFile.Close()

	handler := newHandler(stateFile.Name(), htmlFile.Name())
	req := httptest.NewRequest(http.MethodPost, "/submit",
		strings.NewReader(`{"payload":null}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", rec.Code, http.StatusBadRequest)
	}

	// And nothing should have been appended to state.
	data, _ := os.ReadFile(stateFile.Name())
	if strings.Contains(string(data), `"id"`) && strings.Contains(string(data), `"submissions":[{`) {
		t.Fatalf("state file recorded an invalid submission: %s", string(data))
	}
}

// TestWatchParentDeathTriggersShutdown verifies the parent-death watchdog
// calls Shutdown on the server when os.Getppid() no longer matches the
// PID we recorded at startup. We can't kill the real parent in a test, so
// we feed the watchdog a sentinel PID (current PPID + 1) that, by
// construction, never matches the actual PPID — simulating "parent has
// gone away" on the very first poll.
func TestWatchParentDeathTriggersShutdown(t *testing.T) {
	srv := &http.Server{Addr: "127.0.0.1:0"}
	ln, err := net.Listen("tcp", srv.Addr)
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	srvDone := make(chan error, 1)
	go func() { srvDone <- srv.Serve(ln) }()

	// Sentinel PPID: any value other than the real PPID. The watchdog will
	// see os.Getppid() != originalPPID on its first tick and shut down.
	sentinelPPID := os.Getppid() + 1
	go watchParentDeath(srv, sentinelPPID, 10*time.Millisecond)

	select {
	case err := <-srvDone:
		if err != nil && err != http.ErrServerClosed {
			t.Fatalf("server exited with unexpected error: %v", err)
		}
	case <-time.After(2 * time.Second):
		// Watchdog didn't shut us down; force-close so the test exits.
		ctx, cancel := context.WithTimeout(context.Background(), time.Second)
		_ = srv.Shutdown(ctx)
		cancel()
		t.Fatal("watchdog did not shut down server within 2s")
	}
}

// TestWatchParentDeathSkipsWhenAlreadyInit verifies the watchdog returns
// immediately when originalPPID <= 1 (already a top-level process); it
// should not call Shutdown. We assert this by giving it a server that
// would error if shut down twice and confirming the function returns
// quickly without touching the server.
func TestWatchParentDeathSkipsWhenAlreadyInit(t *testing.T) {
	srv := &http.Server{Addr: "127.0.0.1:0"}
	done := make(chan struct{})
	go func() {
		watchParentDeath(srv, 1, 10*time.Millisecond)
		close(done)
	}()
	select {
	case <-done:
		// expected: returned immediately without polling
	case <-time.After(500 * time.Millisecond):
		t.Fatal("watchdog did not return promptly when originalPPID <= 1")
	}
}

func TestMultipartUploadStoresFileAndEmitsStdout(t *testing.T) {
	stateFile, _ := os.CreateTemp("", "surface-state-*.json")
	defer os.Remove(stateFile.Name())
	stateFile.WriteString(`{"session_id":"test","affordances":{"upload-btn":{"label":"Upload","intent":"upload"}},"submissions":[]}`)
	stateFile.Close()

	htmlFile, _ := os.CreateTemp("", "surface-html-*.html")
	defer os.Remove(htmlFile.Name())
	htmlFile.Close()

	// Build multipart body: id field + file field.
	wantBytes := []byte("hello bytes")
	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	if err := mw.WriteField("id", "upload-btn"); err != nil {
		t.Fatal(err)
	}
	fw, err := mw.CreateFormFile("upload", "greeting.txt")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := fw.Write(wantBytes); err != nil {
		t.Fatal(err)
	}
	if err := mw.Close(); err != nil {
		t.Fatal(err)
	}

	// capture stdout
	oldStdout := os.Stdout
	pr, pw, _ := os.Pipe()
	os.Stdout = pw
	t.Cleanup(func() { os.Stdout = oldStdout })

	handler := newHandler(stateFile.Name(), htmlFile.Name())
	req := httptest.NewRequest(http.MethodPost, "/submit", &body)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}

	pw.Close()
	out, _ := io.ReadAll(pr)
	line := strings.TrimSpace(string(out))
	if !strings.HasPrefix(line, "SUBMIT upload-btn ") {
		t.Fatalf("stdout did not emit expected SUBMIT line: %q", line)
	}
	parts := strings.SplitN(line, " ", 3)
	if len(parts) != 3 {
		t.Fatalf("SUBMIT line malformed: %q", line)
	}
	var payload map[string]any
	if err := json.Unmarshal([]byte(parts[2]), &payload); err != nil {
		t.Fatalf("payload not valid JSON: %q (%v)", parts[2], err)
	}
	filesAny, ok := payload["files"]
	if !ok {
		t.Fatalf("payload missing files field: %v", payload)
	}
	filesSlice, ok := filesAny.([]any)
	if !ok || len(filesSlice) == 0 {
		t.Fatalf("files is not a non-empty array: %v", filesAny)
	}
	first, ok := filesSlice[0].(string)
	if !ok {
		t.Fatalf("file entry is not a string: %v", filesSlice[0])
	}
	if !strings.HasPrefix(first, "/") {
		t.Fatalf("file path is not absolute: %q", first)
	}
	t.Cleanup(func() { os.Remove(first) })

	got, err := os.ReadFile(first)
	if err != nil {
		t.Fatalf("read stored file: %v", err)
	}
	if !bytes.Equal(got, wantBytes) {
		t.Fatalf("stored file content mismatch: got %q want %q", got, wantBytes)
	}

	state, _ := os.ReadFile(stateFile.Name())
	if !strings.Contains(string(state), `"id":"upload-btn"`) {
		t.Fatalf("state file did not record submission: %s", state)
	}
	if !strings.Contains(string(state), `"files":`) {
		t.Fatalf("state file payload missing files: %s", state)
	}
}

// TestSubmitWritesFsDrainFileWhenFsMode exercises the --drain-mode=fs path:
// the server should write one JSON file per submission under
// <state-dir>/submissions/, containing the same envelope that landed in
// state. It should NOT emit a SUBMIT line on stdout in fs mode — the drain
// channel is the filesystem.
func TestSubmitWritesFsDrainFileWhenFsMode(t *testing.T) {
	// Use a fresh tmpdir so we can assert on the entire submissions/ contents.
	dir := t.TempDir()
	statePath := filepath.Join(dir, "state.json")
	if err := os.WriteFile(statePath,
		[]byte(`{"session_id":"test","affordances":{"abc":{"label":"Yes","intent":"yes"}},"submissions":[]}`),
		0o644); err != nil {
		t.Fatal(err)
	}
	htmlPath := filepath.Join(dir, "surface.html")
	if err := os.WriteFile(htmlPath, []byte("<html></html>"), 0o644); err != nil {
		t.Fatal(err)
	}

	// Capture stdout so we can also assert no SUBMIT line is emitted in fs mode.
	oldStdout := os.Stdout
	r, w, _ := os.Pipe()
	os.Stdout = w
	t.Cleanup(func() { os.Stdout = oldStdout })

	handler := newHandler(statePath, htmlPath)
	handler.drain = drainFS

	req := httptest.NewRequest(http.MethodPost, "/submit",
		strings.NewReader(`{"id":"abc","payload":{"value":42}}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}

	w.Close()
	stdout, _ := io.ReadAll(r)
	if strings.Contains(string(stdout), "SUBMIT ") {
		t.Fatalf("fs-mode emitted a SUBMIT stdout line: %q", string(stdout))
	}

	// Exactly one file should land under <state-dir>/submissions/.
	subDir := filepath.Join(dir, "submissions")
	entries, err := os.ReadDir(subDir)
	if err != nil {
		t.Fatalf("read submissions dir: %v", err)
	}
	if len(entries) != 1 {
		var names []string
		for _, e := range entries {
			names = append(names, e.Name())
		}
		t.Fatalf("expected exactly 1 drain file, got %d: %v", len(entries), names)
	}
	name := entries[0].Name()
	// Name shape: <unix-ns>-<id>.json. We don't pin the exact ns value,
	// but we do assert the id suffix is present so consumers can grep.
	if !strings.HasSuffix(name, "-abc.json") {
		t.Fatalf("drain filename did not match <ns>-<id>.json shape: %q", name)
	}

	body, err := os.ReadFile(filepath.Join(subDir, name))
	if err != nil {
		t.Fatalf("read drain file: %v", err)
	}
	var got submission
	if err := json.Unmarshal(body, &got); err != nil {
		t.Fatalf("drain file is not valid submission JSON: %v (%q)", err, string(body))
	}
	if got.ID != "abc" {
		t.Fatalf("drain file id = %q, want %q", got.ID, "abc")
	}
	if got.At == "" {
		t.Fatalf("drain file missing at timestamp: %q", string(body))
	}
	var payload struct {
		Value int `json:"value"`
	}
	if err := json.Unmarshal(got.Payload, &payload); err != nil {
		t.Fatalf("drain file payload not valid JSON: %v", err)
	}
	if payload.Value != 42 {
		t.Fatalf("drain file payload.value = %d, want 42", payload.Value)
	}

	// And state should also have recorded the submission — fs mode replaces
	// the drain side-channel, not the state-append.
	stateRaw, _ := os.ReadFile(statePath)
	if !strings.Contains(string(stateRaw), `"id":"abc"`) {
		t.Fatalf("state file did not record submission: %s", stateRaw)
	}
}

// TestSubmitFsModeFilenamesDoNotCollide asserts the per-submission filename
// scheme doesn't collide when several submissions land back-to-back — the
// unix-ns prefix should give them distinct names. Submissions are issued
// sequentially under the handler's own mutex; this isn't a concurrency test,
// it's a filename-uniqueness test on the timestamp resolution.
func TestSubmitFsModeFilenamesDoNotCollide(t *testing.T) {
	dir := t.TempDir()
	statePath := filepath.Join(dir, "state.json")
	if err := os.WriteFile(statePath,
		[]byte(`{"session_id":"test","affordances":{"abc":{"label":"Yes","intent":"yes"}},"submissions":[]}`),
		0o644); err != nil {
		t.Fatal(err)
	}
	htmlPath := filepath.Join(dir, "surface.html")
	_ = os.WriteFile(htmlPath, []byte("<html></html>"), 0o644)

	// silence stdout (we asserted on it in the previous test)
	oldStdout := os.Stdout
	_, w, _ := os.Pipe()
	os.Stdout = w
	t.Cleanup(func() { os.Stdout = oldStdout; w.Close() })

	handler := newHandler(statePath, htmlPath)
	handler.drain = drainFS

	for i := 0; i < 3; i++ {
		req := httptest.NewRequest(http.MethodPost, "/submit",
			strings.NewReader(`{"id":"abc","payload":null}`))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Fatalf("submission %d status = %d", i, rec.Code)
		}
	}

	entries, err := os.ReadDir(filepath.Join(dir, "submissions"))
	if err != nil {
		t.Fatalf("read submissions dir: %v", err)
	}
	if len(entries) != 3 {
		t.Fatalf("expected 3 drain files, got %d", len(entries))
	}
	seen := map[string]bool{}
	for _, e := range entries {
		if seen[e.Name()] {
			t.Fatalf("duplicate drain filename: %q", e.Name())
		}
		seen[e.Name()] = true
	}
}
