package main

import (
	"encoding/json"
	"io"
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
