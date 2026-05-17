// poke reference server — implements the HTTP+JSON wire described in
// references/wire-example.md. Stdlib only.
//
// Usage:
//
//	go run examples/server.go --state /tmp/poke-state.json --html /tmp/poke.html [--port 5173] [--bind 127.0.0.1]
//
// One canonical wire for localhost use. Loopback bind by default. Emits one
// line per submission to stdout: `SUBMIT <id> <payload-json>`.
package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// state mirrors the wire-example.md schema; we keep affordances and any
// other top-level fields as raw JSON so the server doesn't impose more
// structure than the contract requires.
type state struct {
	SessionID   string                     `json:"session_id"`
	Affordances map[string]json.RawMessage `json:"affordances"`
	Submissions []submission               `json:"submissions"`
}

type submission struct {
	ID      string          `json:"id"`
	Payload json.RawMessage `json:"payload"`
	At      string          `json:"at"`
}

// Handler implements the poke wire (GET /, POST /submit, GET /static/*).
//
// All mutations of the state file are serialized through mu — the wire is
// designed for low-throughput, single-surface use, so a coarse lock is fine
// and keeps the atomic-write-and-emit dance simple.
type Handler struct {
	statePath string
	htmlPath  string
	mu        sync.Mutex
}

func newHandler(statePath, htmlPath string) *Handler {
	return &Handler{statePath: statePath, htmlPath: htmlPath}
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	switch {
	case r.Method == http.MethodGet && r.URL.Path == "/":
		http.ServeFile(w, r, h.htmlPath)
	case r.Method == http.MethodPost && r.URL.Path == "/submit":
		h.submit(w, r)
	default:
		http.NotFound(w, r)
	}
}

func (h *Handler) submit(w http.ResponseWriter, r *http.Request) {
	ct := r.Header.Get("Content-Type")
	// Strip parameters (e.g. "multipart/form-data; boundary=...").
	if i := strings.Index(ct, ";"); i >= 0 {
		ct = ct[:i]
	}
	ct = strings.TrimSpace(strings.ToLower(ct))

	switch ct {
	case "application/json":
		h.submitJSON(w, r)
	case "multipart/form-data":
		h.submitMultipart(w, r)
	default:
		http.Error(w, "unsupported content type", http.StatusUnsupportedMediaType)
	}
}

func (h *Handler) submitJSON(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ID      string          `json:"id"`
		Payload json.RawMessage `json:"payload"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid json: "+err.Error(), http.StatusBadRequest)
		return
	}
	if body.ID == "" {
		http.Error(w, "missing id", http.StatusBadRequest)
		return
	}
	// JSON `null` decodes to a nil RawMessage; normalize to literal null so the
	// stored payload and emitted line are valid JSON.
	if len(body.Payload) == 0 {
		body.Payload = json.RawMessage("null")
	}
	if err := h.record(body.ID, body.Payload); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
}

// record appends a submission to the state file and emits the SUBMIT stdout
// line atomically. The mutex covers the read-modify-write of the state file
// and the stdout write so concurrent submissions can't interleave.
func (h *Handler) record(id string, payload json.RawMessage) error {
	h.mu.Lock()
	defer h.mu.Unlock()

	raw, err := os.ReadFile(h.statePath)
	if err != nil {
		return fmt.Errorf("read state: %w", err)
	}
	var st state
	if err := json.Unmarshal(raw, &st); err != nil {
		return fmt.Errorf("parse state: %w", err)
	}
	st.Submissions = append(st.Submissions, submission{
		ID:      id,
		Payload: payload,
		At:      time.Now().UTC().Format(time.RFC3339Nano),
	})

	out, err := json.Marshal(&st)
	if err != nil {
		return fmt.Errorf("marshal state: %w", err)
	}
	if err := atomicWrite(h.statePath, out); err != nil {
		return fmt.Errorf("write state: %w", err)
	}

	// Per the shared contract, stdout carries one line per submission:
	//   SUBMIT <id> <payload-json>
	// Payload is re-serialized as compact JSON on one line.
	compact, err := compactJSON(payload)
	if err != nil {
		return fmt.Errorf("compact payload: %w", err)
	}
	fmt.Fprintf(os.Stdout, "SUBMIT %s %s\n", id, compact)
	return nil
}

func atomicWrite(path string, data []byte) error {
	dir := filepath.Dir(path)
	tmp, err := os.CreateTemp(dir, ".poke-state-*.tmp")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		os.Remove(tmpName)
		return err
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmpName)
		return err
	}
	return os.Rename(tmpName, path)
}

func compactJSON(raw json.RawMessage) (string, error) {
	var buf bytes.Buffer
	if err := json.Compact(&buf, raw); err != nil {
		return "", err
	}
	return buf.String(), nil
}

func (h *Handler) submitMultipart(w http.ResponseWriter, r *http.Request) {
	// Implemented in Subtask 6B Step 12.
	http.Error(w, "not yet", http.StatusNotImplemented)
}

func main() {
	state := flag.String("state", "", "path to state JSON file")
	html := flag.String("html", "", "path to HTML to serve at /")
	port := flag.Int("port", 5173, "TCP port to listen on")
	bind := flag.String("bind", "127.0.0.1", "address to bind (loopback by default)")
	flag.Parse()

	if *state == "" || *html == "" {
		fmt.Fprintln(os.Stderr, "usage: server --state <path> --html <path> [--port N] [--bind addr]")
		os.Exit(2)
	}

	handler := newHandler(*state, *html)
	addr := fmt.Sprintf("%s:%d", *bind, *port)
	fmt.Fprintf(os.Stderr, "poke: serving %s on http://%s/ (state=%s)\n", *html, addr, *state)
	if err := http.ListenAndServe(addr, handler); err != nil {
		fmt.Fprintf(os.Stderr, "poke: server error: %v\n", err)
		os.Exit(1)
	}
}
