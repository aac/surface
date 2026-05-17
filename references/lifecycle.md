# Lifecycle mechanisms

Autonomous draining is foundational to the pattern: once a poke surface is live, the agent must learn about submissions and react to them on its own — without the user nudging through another channel. The *mechanism* by which the agent learns is the agent's choice. This reference describes the mechanism space and walks through one concrete option (Monitor on background-process stdout in Claude Code). Pick what fits the environment.

## The mechanism space

Four shapes cover the common cases. They are not exclusive — a given poke may combine more than one (e.g., Monitor with a polling fallback).

### Monitor on background-process stdout (Claude Code primitive)

- **When it fits:** local Claude Code session where the agent can spawn the surface's server in the background and read its stdout stream.
- **What's needed:** a server (or any process) that emits one submission-event per line to stdout, and Claude Code's `Monitor` tool pointed at the background process.
- **Tradeoffs:** push-driven and effectively zero-latency, but only works where the agent and the server live on the same machine and the harness exposes a Monitor primitive.

This is the preferred mechanism for local CC use against the canonical HTTP+JSON wire. A worked example follows below.

### ScheduleWakeup / `/loop` polling (Claude Code primitives)

- **When it fits:** stream-based primitives aren't available, the agent is invoked autonomously on a cadence, or the natural task latency is loose enough (minutes) that timer-driven wake-ups are fine.
- **What's needed:** a state file (or any addressable read source) the agent can re-read on each wake, plus a wake-up scheduler.
- **Tradeoffs:** trivially portable across environments and survives process restarts, but adds an inherent latency floor equal to the polling period and pays a small wake-up cost on every tick.

### Filesystem watch (OS-level: `fswatch` / `inotify`)

- **When it fits:** the surface writes submissions to a file (e.g., appends to the state file, or drops one file per submission into a directory) and the agent runs on a host with an OS-level watch primitive available.
- **What's needed:** a watcher (`fswatch`, `inotifywait`, equivalent) and a deterministic write pattern from the server side so the agent knows what to re-read on each event. The reference Go server supports this directly via `--drain-mode fs`: each submission lands as one atomically-written JSON file under `<state-dir>/submissions/`, named `<unix-ns>-<id>.json`. A directory-of-files shape is friendlier to watchers than appending to a single file (one event per submission with no offset bookkeeping); polling the state file is the equally-valid fallback when no OS watch primitive is available.
- **Tradeoffs:** push-driven via the OS without requiring a stream contract from the server, but depends on OS-specific primitives and on the server's write granularity being friendly to watchers (atomic rename, append-only). The drop-directory keeps a queue on disk — consumption (and cleanup) is the draining agent's responsibility, not the server's.

### Push webhook into the agent (environment-dependent)

- **When it fits:** remote or channel-driven setups where the agent isn't co-located with the surface and exposes a callback URL that the surface can POST to.
- **What's needed:** an inbound HTTP endpoint the agent listens on (or the harness exposes), plus the surface configured to POST submission events to it.
- **Tradeoffs:** push-driven and topology-agnostic across machines and channels, but requires the agent to be addressable from the surface and currently has limited primitive support in CC — named here as the abstract shape for non-CC or future environments.

## Worked example: Monitor against the canonical wire

The canonical HTTP+JSON wire (see `wire-example.md`) emits one line per submission to stdout in the form:

```
SUBMIT <id> <payload-json>
```

where `<payload-json>` is single-line JSON. The line is parseable by splitting on the first two spaces and JSON-parsing the remainder. In Claude Code, the natural mechanism is to launch the server with `Bash` in `run_in_background` mode, then use `Monitor` to consume its stdout stream. Pseudocode for the loop:

```
# 1. Render the surface and persist the intent map.
state_path = "/tmp/poke-state.json"
html_path  = "/tmp/poke-surface.html"
write_file(html_path, agent_rendered_html)
write_file(state_path, {
    "session_id":  mint_session_id(),
    "affordances": { "abc123": { "label": "Approve", "intent": "approve_pr_456" },
                     "def456": { "label": "Reject",  "intent": "reject_pr_456"  } },
    "submissions": []
})

# 2. Spawn the reference server in the background.
shell_id = Bash(
    command          = "go run ~/Workspace/poke/examples/server.go "
                       "--state " + state_path + " --html " + html_path + " --port 5173",
    run_in_background = True
)

# 3. Deliver the URL to the user via whatever outbound channel applies
#    (chat message, email, push notification, etc.).
deliver("http://127.0.0.1:5173/")

# 4. Drain submissions by Monitoring the server's stdout. Each yielded
#    line is one event; the harness blocks here until the loop exits.
for line in Monitor(shell_id):
    line = line.rstrip("\n")
    if not line.startswith("SUBMIT "):
        continue   # log noise, startup banner, etc.

    # Parse per shared contract: split on the first two spaces, JSON-parse the rest.
    parts = line.split(" ", 2)
    if len(parts) != 3:
        continue   # malformed; skip or surface
    _, affordance_id, payload_json = parts
    payload = json_parse(payload_json)   # may be null, object, array, etc.

    # 5. Look up the intent in agent-owned state and react.
    state  = json_parse(read_file(state_path))
    intent = state["affordances"].get(affordance_id, {}).get("intent")
    react(intent, payload)

    # 6. Decide whether this poke is complete. If so, exit the loop
    #    (the loop body, not Monitor itself — exit is the agent's call).
    if is_terminal(intent, payload):
        break

# 7. Tear down: kill the background server and clean the state file.
KillShell(shell_id)
delete_file(state_path)
```

A few notes on what the example *doesn't* prescribe, on purpose:

- **`react(intent, payload)`** is whatever the task demands — applying refactors, recording an approval, triggering a downstream tool. The intent shape is the agent's own.
- **`is_terminal(...)`** depends on the surface. A one-shot "Approve / Reject" terminates on first submission; a "check 30 boxes and click Apply" terminates on the Apply click; a long-lived dashboard might never terminate within this loop and instead exit on a sentinel or timeout.
- **Error handling, malformed lines, server crashes, and the user never clicking** are operational concerns; see "Beyond the pattern" below.

## Worked example: filesystem-watch drain

When stdout isn't the natural channel — the agent isn't a long-lived process tailing the server, the harness lacks a Monitor primitive, or the surface is being served by a sibling process the draining agent didn't spawn — a drop-directory works for the same wire. The reference server takes `--drain-mode fs`: instead of emitting a `SUBMIT` line, it writes one JSON file per submission under `<state-dir>/submissions/`, named `<unix-ns>-<id>.json`, body shape `{"id":"...","payload":..., "at":"..."}` (the same envelope that landed in state).

```
# 1. Render the surface and persist state, as before.
state_path = "/tmp/poke-state.json"   # state-dir is /tmp
html_path  = "/tmp/poke-surface.html"
write_file(html_path, agent_rendered_html)
write_file(state_path, { ... })

# 2. Spawn the server in fs-drain mode. No stdout to monitor.
spawn_detached(
    "go run ~/Workspace/poke/examples/server.go "
    "--state " + state_path + " --html " + html_path +
    " --port 5173 --drain-mode fs"
)

# 3. Deliver the URL.
deliver("http://127.0.0.1:5173/")

# 4. Drain by watching the drop-directory. Three valid shapes; pick what fits.

# Shape A — fswatch (macOS / portable), one event per file landing:
#   fswatch -0 /tmp/submissions | while IFS= read -r -d '' path; do
#     consume "$path"
#     rm     "$path"
#   done
#
# Shape B — inotifywait (Linux), reacting to close_write so partial files don't fire:
#   inotifywait -m -e close_write --format '%w%f' /tmp/submissions |
#     while read -r path; do
#       consume "$path"
#       rm     "$path"
#     done
#
# Shape C — polling (no OS watcher needed, portable everywhere):
#   while :; do
#     for f in $(ls /tmp/submissions/*.json 2>/dev/null | sort); do
#       consume "$f"
#       rm      "$f"
#     done
#     sleep 1
#   done

# 5. consume() is the agent's react loop: parse file → look up intent → react.
consume(path):
    entry  = json_parse(read_file(path))         # {"id","payload","at"}
    state  = json_parse(read_file(state_path))
    intent = state["affordances"].get(entry["id"], {}).get("intent")
    react(intent, entry["payload"])

# 6. Teardown is the same as the Monitor example: kill the server, remove the
#    state file. The agent also owns clearing leftover files in submissions/
#    (or just removing the directory) — the server doesn't track consumption.
```

What this shape buys you and what it costs:

- **Buys:** decouples the draining agent from the spawning process. Any agent (or human) that can read the drop-directory can drain. Submissions queue on disk while no one is watching, so the agent can be invoked later and pick up the backlog.
- **Costs:** consumption state lives on the consumer (which files have been processed). The server doesn't know whether a submission has been drained — it just keeps producing. The agent must delete (or move) each file after handling, or the drain re-fires on next watch.
- **Atomic-write matters:** the reference server uses temp-file + rename so a watcher never sees a half-written JSON. Custom servers writing into the drop-directory should do the same; `close_write` (inotify) or `IN_MOVED_TO` semantics avoid firing on partial writes.

## Cadence guidance

Push-driven mechanisms (Monitor, filesystem watch, push webhook) deliver events at event-time — the agent reacts as soon as a submission lands. No cadence to tune.

Polling mechanisms (`ScheduleWakeup`, `/loop`) trade latency for portability. Match the polling period to the task's latency tolerance: seconds for interactive approval gates where the user is sitting at the URL; minutes for async approval gates where the user may take a while; longer still for "check once an hour for a daily-digest reply." Don't poll faster than the task needs; the wake-up cost is real.

## Beyond the pattern

Timeouts (user never clicks), idempotency (the same submission seen twice — duplicate Monitor delivery, retried multipart upload), retry, recovery after server crash, concurrent pokes, port choice, and state-file lifecycle are agent responsibilities, not pattern responsibilities. See `pattern.md` §"Beyond the pattern" for the full list. The pattern fixes the *requirement* of autonomous draining; the agent decides how robust the loop around it needs to be for the task at hand.

One specific operational hazard worth naming: if you reuse a port across pokes, prior browser tabs cached on that URL will interact with whatever server is currently bound — possibly a new one rendering the wrong page. The reference server sends `Cache-Control: no-store, must-revalidate` on the served HTML to nudge browsers to refetch; agents that build their own wires should consider the same, or rotate ports per poke so cached tabs simply 404 against a closed port.
