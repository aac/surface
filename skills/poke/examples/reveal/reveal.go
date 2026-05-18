// poke inline-reveal example — demonstrates Rule 5 ("the surface owns the
// result"). When the user clicks an affordance, the server records the
// submission *and* responds with the result the page reveals inline. The
// user sees the answer on the surface itself, not in chat.
//
// This is illustrative, not normative. The pattern is "surface owns the
// result"; the mechanism here (fetch /submit → JSON response carrying the
// reveal text → swap into a panel via textContent) is one of many. A richer
// surface could return HTML fragments, swap whole sections, animate, or
// route to a follow-up step. Stdlib only on the server side.
//
// Smoke recipe (from skills/poke/):
//
//	go run ./examples/reveal --port 5174 &
//	curl -sS http://127.0.0.1:5174/                       # render the page
//	curl -sS -X POST -H 'Content-Type: application/json' \
//	     -d '{"id":"opt-a"}' http://127.0.0.1:5174/submit  # JSON with reveal
//	# Stdout shows: SUBMIT opt-a {"id":"opt-a"}
//
// The /submit response body carries the reveal. Open the URL in a browser
// and click a button to see the inline-swap behavior end-to-end.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"net/http"
	"os"
	"sync"
	"time"
)

// answers map an affordance id to the result the surface should reveal when
// the user clicks it. In a real poke the agent mints these and persists the
// id → intent → answer map; this example bakes them in to keep the focus on
// the reveal mechanism.
var answers = map[string]string{
	"opt-a": "You picked A. The deploy will roll out to us-east-1 first.",
	"opt-b": "You picked B. The deploy will roll out to eu-west-1 first.",
	"opt-c": "You picked C. The deploy is paused — nothing rolls out tonight.",
}

const page = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>poke — inline reveal</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 32rem; margin: 2rem auto; padding: 0 1rem; }
  button { display: block; width: 100%; padding: 0.75rem 1rem; margin: 0.5rem 0; font-size: 1rem; cursor: pointer; }
  #reveal { margin-top: 1.5rem; padding: 1rem; border-left: 3px solid #888; background: #f6f6f6; min-height: 1.5rem; white-space: pre-wrap; }
  #reveal:empty::before { content: "(your answer will appear here)"; color: #888; font-style: italic; }
  #reveal strong { display: block; margin-bottom: 0.25rem; }
</style>
</head>
<body>
<h1>Which rollout?</h1>
<p>Pick one. The answer appears below — no need to switch back to chat.</p>
<button data-id="opt-a">A — us-east-1 first</button>
<button data-id="opt-b">B — eu-west-1 first</button>
<button data-id="opt-c">C — pause the deploy</button>
<div id="reveal"></div>
<script>
document.querySelectorAll('button[data-id]').forEach(b => {
  b.addEventListener('click', async () => {
    const id = b.getAttribute('data-id');
    const res = await fetch('/submit', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({id})
    });
    const data = await res.json();
    // Build the reveal with textContent — user-visible answer text is
    // untrusted-by-default, so no innerHTML on response data.
    const panel = document.getElementById('reveal');
    panel.replaceChildren();
    const header = document.createElement('strong');
    header.textContent = 'Recorded.';
    const body = document.createTextNode(data.answer || ('Unknown affordance: ' + id));
    panel.append(header, body);
  });
});
</script>
</body>
</html>
`

type handler struct {
	mu sync.Mutex
}

func (h *handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	switch {
	case r.Method == http.MethodGet && r.URL.Path == "/":
		w.Header().Set("Cache-Control", "no-store, must-revalidate")
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(page))
	case r.Method == http.MethodPost && r.URL.Path == "/submit":
		h.submit(w, r)
	default:
		http.NotFound(w, r)
	}
}

func (h *handler) submit(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid json: "+err.Error(), http.StatusBadRequest)
		return
	}
	if body.ID == "" {
		http.Error(w, "missing id", http.StatusBadRequest)
		return
	}

	// Serialize the drain-side effect so concurrent submits don't interleave
	// on stdout. The poke contract is "agent learns the user's path"; we
	// emit a `SUBMIT <id> <payload-json>` line matching the canonical wire
	// example so any draining mechanism in references/lifecycle.md keeps
	// working.
	h.mu.Lock()
	fmt.Fprintf(os.Stdout, "SUBMIT %s {\"id\":%q}\n", body.ID, body.ID)
	h.mu.Unlock()

	answer, ok := answers[body.ID]
	if !ok {
		// Unknown id → still reveal *something* on the surface so the user
		// isn't left staring at a dead button.
		answer = "Unknown affordance: " + body.ID
	}

	// The response body IS the reveal — the page swaps it into #reveal.
	resp, err := json.Marshal(map[string]string{"answer": answer})
	if err != nil {
		http.Error(w, "encode response: "+err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write(resp)
}

func main() {
	port := flag.Int("port", 5174, "TCP port to listen on")
	bind := flag.String("bind", "127.0.0.1", "address to bind (loopback by default)")
	flag.Parse()

	addr := fmt.Sprintf("%s:%d", *bind, *port)
	fmt.Fprintf(os.Stderr, "poke reveal: serving http://%s/ (open in a browser, or curl /submit)\n", addr)

	srv := &http.Server{Addr: addr, Handler: &handler{}}

	go watchParentDeath(srv, os.Getppid(), 500*time.Millisecond)

	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		fmt.Fprintf(os.Stderr, "poke reveal: server error: %v\n", err)
		os.Exit(1)
	}
}

// watchParentDeath mirrors the watchdog from examples/server.go — when the
// original parent exits (e.g. an agent harness kills the `go run` wrapper but
// the compiled child stays alive), shut down so the port doesn't linger.
func watchParentDeath(srv *http.Server, originalPPID int, tick time.Duration) {
	if originalPPID <= 1 {
		return
	}
	for {
		time.Sleep(tick)
		if os.Getppid() != originalPPID {
			fmt.Fprintln(os.Stderr, "poke reveal: parent process exited; shutting down")
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			_ = srv.Shutdown(ctx)
			cancel()
			return
		}
	}
}
