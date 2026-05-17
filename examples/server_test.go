package main

import (
	"bytes"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

func TestServerServesHTML(t *testing.T) {
	htmlFile, err := os.CreateTemp("", "poke-html-*.html")
	if err != nil {
		t.Fatal(err)
	}
	defer os.Remove(htmlFile.Name())
	htmlFile.WriteString("<html><body>hello poke</body></html>")
	htmlFile.Close()

	stateFile, err := os.CreateTemp("", "poke-state-*.json")
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
	if !strings.Contains(string(body), "hello poke") {
		t.Fatalf("body did not contain expected HTML: %s", string(body))
	}
}

func TestSubmitAppendsStateAndEmitsStdout(t *testing.T) {
	stateFile, _ := os.CreateTemp("", "poke-state-*.json")
	defer os.Remove(stateFile.Name())
	stateFile.WriteString(`{"session_id":"test","affordances":{"abc":{"label":"Yes","intent":"yes"}},"submissions":[]}`)
	stateFile.Close()

	htmlFile, _ := os.CreateTemp("", "poke-html-*.html")
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

func TestMultipartUploadStoresFileAndEmitsStdout(t *testing.T) {
	stateFile, _ := os.CreateTemp("", "poke-state-*.json")
	defer os.Remove(stateFile.Name())
	stateFile.WriteString(`{"session_id":"test","affordances":{"upload-btn":{"label":"Upload","intent":"upload"}},"submissions":[]}`)
	stateFile.Close()

	htmlFile, _ := os.CreateTemp("", "poke-html-*.html")
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
