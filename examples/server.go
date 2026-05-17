// poke reference server — implements the HTTP+JSON wire described in
// references/wire-example.md. Stdlib only.
//
// Usage:
//
//	go run examples/server.go --state /tmp/poke-state.json --html /tmp/poke.html [--port 5173] [--bind 127.0.0.1] [--drain-mode stdout|fs]
//
// One canonical wire for localhost use. Loopback bind by default.
//
// Drain modes (how the agent learns about new submissions; see
// references/lifecycle.md for the full mechanism space):
//
//   - stdout (default): emits one line per submission to stdout in the form
//     `SUBMIT <id> <payload-json>`. Suits Monitor-on-background-process.
//   - fs: writes one file per submission under <state-dir>/submissions/
//     named `<unix-ns>-<id>.json`. Suits fswatch / inotify drains, polling
//     directory listings, or any environment where the agent can't tail
//     the server's stdout.
package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"mime/multipart"
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

// drainMode selects how the server signals each newly-recorded submission
// to its draining agent. See package doc and references/lifecycle.md for the
// full mechanism space.
type drainMode int

const (
	drainStdout drainMode = iota // emit `SUBMIT <id> <payload-json>` to stdout
	drainFS                      // write per-submission file under <state-dir>/submissions/
)

// handler implements the poke wire (GET /, POST /submit). The /static/<path>
// route described in references/wire-example.md is marked Optional there; this
// reference server omits it since the canonical surface is one HTML doc.
//
// All mutations of the state file are serialized through mu — the wire is
// designed for low-throughput, single-surface use, so a coarse lock is fine
// and keeps the atomic-write-and-emit dance simple.
type handler struct {
	statePath string
	htmlPath  string
	drain     drainMode
	mu        sync.Mutex
}

func newHandler(statePath, htmlPath string) *handler {
	return &handler{statePath: statePath, htmlPath: htmlPath, drain: drainStdout}
}

func (h *handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	switch {
	case r.Method == http.MethodGet && r.URL.Path == "/":
		// no-store guards against stale-tab hazard: if a previous poke left
		// a browser tab open at this URL and a new server later binds the
		// same port, the cached page would otherwise interact with whatever
		// is now running. Nudging the browser to refetch keeps the surface
		// consistent with the server's current state.
		w.Header().Set("Cache-Control", "no-store, must-revalidate")
		http.ServeFile(w, r, h.htmlPath)
	case r.Method == http.MethodPost && r.URL.Path == "/submit":
		h.submit(w, r)
	default:
		http.NotFound(w, r)
	}
}

func (h *handler) submit(w http.ResponseWriter, r *http.Request) {
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

func (h *handler) submitJSON(w http.ResponseWriter, r *http.Request) {
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

// record appends a submission to the state file and signals the draining
// agent atomically. The mutex covers the read-modify-write of the state file
// and the drain-side effect so concurrent submissions can't interleave.
//
// The drain-side effect depends on the configured mode:
//   - stdout: a single `SUBMIT <id> <payload-json>` line on stdout
//   - fs: a per-submission file under <state-dir>/submissions/
func (h *handler) record(id string, payload json.RawMessage) error {
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
	entry := submission{
		ID:      id,
		Payload: payload,
		At:      time.Now().UTC().Format(time.RFC3339Nano),
	}
	st.Submissions = append(st.Submissions, entry)

	out, err := json.Marshal(&st)
	if err != nil {
		return fmt.Errorf("marshal state: %w", err)
	}
	if err := atomicWrite(h.statePath, out); err != nil {
		return fmt.Errorf("write state: %w", err)
	}

	switch h.drain {
	case drainFS:
		if err := h.writeFSDrainFile(entry); err != nil {
			return fmt.Errorf("write drain file: %w", err)
		}
	case drainStdout:
		// Per the shared contract, stdout carries one line per submission:
		//   SUBMIT <id> <payload-json>
		// Payload is re-serialized as compact JSON on one line.
		compact, err := compactJSON(payload)
		if err != nil {
			return fmt.Errorf("compact payload: %w", err)
		}
		fmt.Fprintf(os.Stdout, "SUBMIT %s %s\n", id, compact)
	}
	return nil
}

// writeFSDrainFile lands one submission as a single file under
// <state-dir>/submissions/. The filename prefix is the wall-clock unix-nanos
// so directory listings sort in arrival order naturally; the id is suffixed
// so a human (or a debugger) can map files to affordances at a glance.
//
// The directory is created on demand (0o755) — the server owns producing the
// drain stream; consuming and cleaning up files is the draining agent's job.
func (h *handler) writeFSDrainFile(entry submission) error {
	dir := filepath.Join(filepath.Dir(h.statePath), "submissions")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	body, err := json.Marshal(entry)
	if err != nil {
		return err
	}
	// Atomic write so a watching agent never reads a half-written file.
	name := fmt.Sprintf("%d-%s.json", time.Now().UTC().UnixNano(), sanitizeIDForPath(entry.ID))
	return atomicWrite(filepath.Join(dir, name), body)
}

// sanitizeIDForPath keeps the filename safe for any filesystem the server
// might land on: alphanumerics and a small set of punctuation pass through;
// anything else collapses to `_`. The affordance id is opaque to the wire,
// so this is purely cosmetic — the id inside the file body is authoritative.
func sanitizeIDForPath(id string) string {
	if id == "" {
		return "id"
	}
	var b strings.Builder
	b.Grow(len(id))
	for _, r := range id {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9':
			b.WriteRune(r)
		case r == '-', r == '_', r == '.':
			b.WriteRune(r)
		default:
			b.WriteByte('_')
		}
	}
	return b.String()
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
	if err := os.Rename(tmpName, path); err != nil {
		os.Remove(tmpName)
		return err
	}
	return nil
}

func compactJSON(raw json.RawMessage) (string, error) {
	var buf bytes.Buffer
	if err := json.Compact(&buf, raw); err != nil {
		return "", err
	}
	return buf.String(), nil
}

// maxMultipartMemory caps the in-memory portion of multipart parsing; larger
// uploads spill to the OS tmp dir via the stdlib, which is fine for the
// reference server's ephemeral-surface use case.
const maxMultipartMemory = 32 << 20 // 32 MiB

func (h *handler) submitMultipart(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(maxMultipartMemory); err != nil {
		http.Error(w, "invalid multipart: "+err.Error(), http.StatusBadRequest)
		return
	}
	form := r.MultipartForm

	id := r.FormValue("id")
	if id == "" {
		http.Error(w, "missing id", http.StatusBadRequest)
		return
	}

	// Collect uploaded files, saving each to a per-process tmpdir under
	// os.TempDir(). Path shape: <TempDir>/poke-uploads/<random-hex>-<safe-name>.
	// Initialize as empty slice (not nil) so JSON marshaling always emits []
	// rather than null when no files are present — the wire contract documents
	// `files` as an array that is always present.
	savedPaths := []string{}
	uploadDir := filepath.Join(os.TempDir(), "poke-uploads")
	if err := os.MkdirAll(uploadDir, 0o755); err != nil {
		http.Error(w, "create upload dir: "+err.Error(), http.StatusInternalServerError)
		return
	}
	for _, headers := range form.File {
		for _, fh := range headers {
			path, err := saveUpload(uploadDir, fh)
			if err != nil {
				http.Error(w, "save upload: "+err.Error(), http.StatusInternalServerError)
				return
			}
			savedPaths = append(savedPaths, path)
		}
	}

	// Build payload: include the files array always, plus any non-id form
	// fields the surface posted (collapsed to first value per name for
	// simplicity; agents needing more structure can pick another wire).
	payload := map[string]any{"files": savedPaths}
	for name, values := range form.Value {
		if name == "id" || len(values) == 0 {
			continue
		}
		payload[name] = values[0]
	}
	encoded, err := json.Marshal(payload)
	if err != nil {
		http.Error(w, "encode payload: "+err.Error(), http.StatusInternalServerError)
		return
	}

	if err := h.record(id, json.RawMessage(encoded)); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
}

// saveUpload writes one uploaded file under dir with a random-hex prefix and
// a sanitized original filename, returning the absolute path.
func saveUpload(dir string, fh *multipart.FileHeader) (string, error) {
	src, err := fh.Open()
	if err != nil {
		return "", err
	}
	defer src.Close()

	var nonce [8]byte
	if _, err := rand.Read(nonce[:]); err != nil {
		return "", err
	}
	name := hex.EncodeToString(nonce[:]) + "-" + sanitizeFilename(fh.Filename)
	full := filepath.Join(dir, name)
	abs, err := filepath.Abs(full)
	if err != nil {
		return "", err
	}

	dst, err := os.Create(abs)
	if err != nil {
		return "", err
	}
	if _, err := io.Copy(dst, src); err != nil {
		dst.Close()
		os.Remove(abs)
		return "", err
	}
	if err := dst.Close(); err != nil {
		os.Remove(abs)
		return "", err
	}
	return abs, nil
}

// sanitizeFilename strips path components and falls back to a generic name
// when the upload supplies an empty or path-shaped name.
func sanitizeFilename(name string) string {
	name = filepath.Base(name)
	if name == "" || name == "." || name == "/" || name == `\` {
		return "upload"
	}
	return name
}

func main() {
	state := flag.String("state", "", "path to state JSON file")
	html := flag.String("html", "", "path to HTML to serve at /")
	port := flag.Int("port", 5173, "TCP port to listen on")
	bind := flag.String("bind", "127.0.0.1", "address to bind (loopback by default)")
	drain := flag.String("drain-mode", "stdout", "submission drain channel: stdout|fs")
	flag.Parse()

	if *state == "" || *html == "" {
		fmt.Fprintln(os.Stderr, "usage: server --state <path> --html <path> [--port N] [--bind addr] [--drain-mode stdout|fs]")
		os.Exit(2)
	}

	handler := newHandler(*state, *html)
	switch strings.ToLower(*drain) {
	case "stdout", "":
		handler.drain = drainStdout
	case "fs":
		handler.drain = drainFS
	default:
		fmt.Fprintf(os.Stderr, "poke: unknown --drain-mode %q (want stdout|fs)\n", *drain)
		os.Exit(2)
	}

	addr := fmt.Sprintf("%s:%d", *bind, *port)
	fmt.Fprintf(os.Stderr, "poke: serving %s on http://%s/ (state=%s drain=%s)\n", *html, addr, *state, *drain)

	srv := &http.Server{Addr: addr, Handler: handler}

	// Parent-death watchdog: when the original parent goes away (e.g. the
	// `go run` wrapper is killed but the compiled child binary is orphaned),
	// the kernel reparents us to PID 1. Detect that and shut down so we don't
	// hold the port for the next session. Cheap, stdlib-only, and harmless if
	// the parent never dies — the goroutine just polls quietly.
	go watchParentDeath(srv, os.Getppid(), 500*time.Millisecond)

	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		fmt.Fprintf(os.Stderr, "poke: server error: %v\n", err)
		os.Exit(1)
	}
}

// watchParentDeath polls os.Getppid() and triggers a graceful shutdown when
// the parent PID changes to 1 (reparented to init) — i.e. the original parent
// has exited. originalPPID is the PID we started under; tick is the poll
// interval. Loop exits after triggering shutdown.
func watchParentDeath(srv *http.Server, originalPPID int, tick time.Duration) {
	// If we were launched directly by init (rare; container PID 1 etc.) there's
	// nothing to watch — bail out and let the parent-supervisor handle teardown.
	if originalPPID <= 1 {
		return
	}
	for {
		time.Sleep(tick)
		if os.Getppid() != originalPPID {
			fmt.Fprintln(os.Stderr, "poke: parent process exited; shutting down")
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			_ = srv.Shutdown(ctx)
			cancel()
			return
		}
	}
}
