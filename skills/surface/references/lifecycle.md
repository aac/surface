# Lifecycle mechanisms

Autonomous draining is foundational to the pattern: once a surface is live, the agent must learn about submissions and react to them on its own — without the user nudging through another channel. The *mechanism* by which the agent learns is the agent's choice. This reference describes the mechanism space and walks through one concrete option (Monitor on background-process stdout in Claude Code). Pick what fits the environment.

## The mechanism space

Four shapes cover the common cases. They are not exclusive — a given surface may combine more than one (e.g., Monitor with a polling fallback).

### Push-stream on subprocess stdout

- **When it fits:** the agent can spawn the surface's server in the background and read its stdout stream — both living on the same machine.
- **What's needed:** a server (or any process) that emits one submission-event per line to stdout, and a harness primitive that streams background-process output to the agent.
- **Tradeoffs:** push-driven and effectively zero-latency, but requires the agent and server to be co-located and the harness to expose a stream-reading primitive.

**Claude Code:** launch the server with `Bash(run_in_background=True)` to get a shell ID, then pass that ID to `Monitor` to stream its stdout. **Important:** launch the server and point Monitor at it separately — don't embed the server launch inside the Monitor command, or the server dies when Monitor times out. A worked example follows below.

**Codex:** spawn the server under the long-running tool pattern (a background shell the tool keeps alive), then tail its stdout in a loop using the subprocess tail primitive, reading one `SUBMIT` line at a time. The decoupled shape is the same — server lifetime and drain lifetime stay separate.

### Scheduled wake-ups for cadence

- **When it fits:** stream-based primitives aren't available, the agent is invoked autonomously on a cadence, or the natural task latency is loose enough (minutes) that timer-driven wake-ups are fine.
- **What's needed:** a state file (or any addressable read source) the agent can re-read on each wake, plus a wake-up scheduler.
- **Tradeoffs:** trivially portable across environments and survives process restarts, but adds an inherent latency floor equal to the polling period and pays a small wake-up cost on every tick.

**Claude Code:** `ScheduleWakeup` to re-invoke the agent on a timer, or `/loop` in an interactive session to repeatedly call the draining step. **Codex:** the agent scheduler (`openai.beta.threads` with periodic re-invocation, or a hosted cron) fires the drain step on cadence. Either way, the drain reads the state file or polls the wire's `/poll` endpoint on each wake.

### Filesystem drop-directory watch

- **When it fits:** the surface writes submissions to a file (e.g., appends to the state file, or drops one file per submission into a directory) and the agent runs on a host with an OS-level watch primitive available.
- **What's needed:** a watcher (`fswatch`, `inotifywait`, equivalent) and a deterministic write pattern from the server side so the agent knows what to re-read on each event. The reference Go server supports this directly via `--drain-mode fs`: each submission lands as one atomically-written JSON file under `<state-dir>/submissions/`, named `<unix-ns>-<id>.json`. A directory-of-files shape is friendlier to watchers than appending to a single file (one event per submission with no offset bookkeeping); polling the state file is the equally-valid fallback when no OS watch primitive is available.
- **Tradeoffs:** push-driven via the OS without requiring a stream contract from the server, but depends on OS-specific primitives and on the server's write granularity being friendly to watchers (atomic rename, append-only). The drop-directory keeps a queue on disk — consumption (and cleanup) is the draining agent's responsibility, not the server's.

**Claude Code and Codex:** both can shell out to `fswatch` (macOS) or `inotifywait` (Linux) via a `Bash` call (Claude Code) or a subprocess tool call (Codex). The watcher is OS-level — no harness-specific primitive needed on either side. A polling fallback (loop over directory contents) works identically in both environments and requires no OS watcher at all.

### Push webhook into the agent

- **When it fits:** remote or channel-driven setups where the agent isn't co-located with the surface and exposes a callback URL that the surface can POST to.
- **What's needed:** an inbound HTTP endpoint the agent listens on (or the harness exposes), plus the surface configured to POST submission events to it.
- **Tradeoffs:** push-driven and topology-agnostic across machines and channels, but requires the agent to be addressable from the surface.

**Claude Code:** no built-in inbound HTTP primitive; the natural approach is a helper process that binds a port and writes events to a file or stdout that the agent can read. **Codex:** the OpenAI platform exposes an action callback URL for each run; the surface can POST to it directly, delivering submissions as tool results without any agent-side listener. Either way, the surface is configured at mint time with the callback URL.

## Server lifetime vs. drain lifetime

The server and the drain mechanism are separate concerns with different lifetime requirements. The server must stay alive as long as the surface is active; the drain must be re-armable without restarting the server. Coupling them — e.g., launching the server *inside* a Monitor command so the server dies when the Monitor times out — creates a fragile pair where the surface goes offline whenever the drain needs re-arming.

Preferred shape: start the server via `run_in_background` (or `nohup`, or `--drain-mode fs`), then point the drain mechanism at it separately. If the drain times out or needs re-arming, the server keeps serving. The worked Monitor example below shows the decoupled shape.

## Mint lifetime vs. react lifetime

The server-vs-drain split has a sibling one altitude up: the agent that *mints* a surface and the agent that *reacts* to a submission need not be the same agent — and across any gap longer than a held-open session, they must not be.

**Hold-open.** The minting session stays live and drains in place — Monitor on the server's stdout, or a tight `ScheduleWakeup`/`/loop` cadence. Near-zero latency; the cost is the session idling. Correct for seconds-to-about-an-hour windows with a present recipient. Note that `ScheduleWakeup` wakes *this* session — a within-session timer, not a detachment mechanism; the full transcript and accumulated context come with it on every wake. Across a multi-hour gap that is both a robustness problem (harnesses warn against resuming long-idle sessions) and a cost one (re-reading a day of transcript per wake).

**Detached.** Minting and reaction are separate agent invocations. The minting session renders the surface, persists the intent map, detaches the server/store so it outlives the session, arms a trigger, delivers the URL, and **exits** — it does not wait. Reaction happens later in a *fresh agent* that loads the durable state rather than resuming the minting session. The surface survives session death, and the reactor starts against a small state file instead of a day-old transcript. (Starting fresh is not free — the agent still loads the skill and whatever repo or world context the reaction needs; the win is real when the gap is long or submissions are sparse, not when you would have drained in the next ninety seconds.)

The regime choice is orthogonal to interactive-vs-autonomous invocation: an interactive session can mint-and-detach when the recipient won't respond soon, and an autonomous agent can hold open briefly when latency tolerance is tight.

The detached regime sharpens two things hold-open lets you cheat on, and adds one hazard:

- **The intent map must carry reaction context, not just labels.** A held-open drain leans on the warm session's memory of why the surface exists; a fresh agent has none. The persisted state must say, per affordance, not only *what was chosen* but *what reacting means* — which repo, which action, where the result goes — richly enough for a context-free agent to act.
- **Reaction results need an outbound channel.** The minting chat is gone, so the reactor has nowhere to reply; it delivers through whatever outbound channel it has (`reach` preferred) — the same logic that delivered the URL.
- **State decays between mint and reaction.** The world can change while the surface is live — the PR merges, the resource frees, permissions are revoked. The intent map carries *what to do if conditions still hold*, not *whether they hold*; a fresh agent should re-validate against the live world before acting. Hold-open dodges this because the warm session can re-query continuously.

Mechanism-to-regime mapping: Monitor and tight `ScheduleWakeup`/`/loop` are hold-open; a scheduled fresh-agent (cron/routine) poll, or a push-webhook that spawns a fresh agent, are detached. The fs drop-directory is regime-neutral — it queues submissions for either a held-open watcher or a later fresh drain.

**Gating a fresh agent with a non-agent detector (optional).** In the detached regime, the cheapest correct shape is often to put a *non-agent* process between the surface and the agent: a few lines of shell, a small binary, or the surface's own server watches for a submission and invokes an agent *only when one lands*. This collapses two wastes at once — the idle-session cost of holding an agent open, and the empty-tick token cost of waking a full agent on every poll to find nothing. Locally, the server (or a small watcher over the `--drain-mode fs` drop-directory) spawns the reacting agent on submit via whatever agent-invocation entry point the environment exposes. In a hosted setup the Worker already *is* such a detector — it costs nothing idle, and the push-webhook shape is its ideal form: on submit it triggers a fresh agent rather than waiting to be polled. This is an optimization, not an invariant — a consequence agents derive from the pattern plus their constraints, not something the pattern mandates; for a surface you'll drain in the next ninety seconds a held-open Monitor is simpler and correct. Reach for it when the gap is long, submissions are sparse, or the surface runs multiple rounds spaced in human time — the cases where the wasteful alternative stays invisible in a short test. That alternative is a detached drain that wakes a *full agent* on every poll tick, paying an agent's cost to find an empty inbox. The axis is what each wake-up wakes, not poll-vs-push: a cron that fires a cheap non-agent check and spawns an agent only on a hit is itself a detector. (A multi-round surface that genuinely needs a live connection is a different shape — see the WebSocket example.) What the detector invokes the agent with, how it authenticates, and whether it batches near-simultaneous submissions are implementation-defined — but note the boundary adds a concurrency consideration a single held-open loop doesn't: two submissions landing close together can spawn two agents over the same state, so serialize or dedupe if that matters. Consumption/idempotency tracking stays the reacting agent's job, as in the fs-drop shape.

## Worked example: Monitor against the canonical wire

The canonical HTTP+JSON wire (see `wire-example.md`) emits one line per submission to stdout in the form:

```
SUBMIT <id> <payload-json>
```

where `<payload-json>` is single-line JSON. The line is parseable by splitting on the first two spaces and JSON-parsing the remainder. In Claude Code, the natural mechanism is to launch the server with `Bash` in `run_in_background` mode, then use `Monitor` to consume its stdout stream. Pseudocode for the loop:

```
# 1. Render the surface and persist the intent map.
state_path = "/tmp/surface-state.json"
html_path  = "/tmp/surface.html"
write_file(html_path, agent_rendered_html)
write_file(state_path, {
    "session_id":  mint_session_id(),
    "affordances": { "abc123": { "label": "Approve", "intent": "approve_pr_456" },
                     "def456": { "label": "Reject",  "intent": "reject_pr_456"  } },
    "submissions": []
})

# 2. Spawn the reference server in the background.
shell_id = Bash(
    command          = "go run ~/Workspace/poke/skills/surface/examples/server.go "
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

    # 6. Decide whether this surface is complete. If so, exit the loop
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
state_path = "/tmp/surface-state.json"   # state-dir is /tmp
html_path  = "/tmp/surface.html"
write_file(html_path, agent_rendered_html)
write_file(state_path, { ... })

# 2. Spawn the server in fs-drain mode. No stdout to monitor.
spawn_detached(
    "go run ~/Workspace/poke/skills/surface/examples/server.go "
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

**Variant — gate a fresh agent instead of a held-open loop.** The watcher above tails the drop-directory inside a live agent. A non-agent watcher can instead *invoke* a fresh agent on each new file, so an agent is paid for only per submission rather than held open. See "Mint lifetime vs. react lifetime" above for when this is worth it and the concurrency caveat.

## Worked example: poll-drain against the hosted wire

When the substrate is remote (Cloudflare Worker + KV, a Vercel function over
Postgres, anything where the agent can't tail a stdout stream), the natural
drain is a pull on an endpoint the surface exposes. The hosted reference at
`examples/worker/` ships `GET /<session_id>/poll?since=<unix-ms>` for exactly
this — see `hosted-example.md` for the wire-level contract.

The agent owns the cursor (`since`) and the cadence:

```
# 1. Provision the session via the worker's agent-only /_provision endpoint.
#    Returns the session id, the public surface URL, and the CSRF token.
resp = http_post(
    BASE + "/_provision",
    headers = { "authorization": "Bearer " + PROVISION_TOKEN,
                "content-type":  "application/json" },
    body    = json_encode({
        "html":        agent_rendered_html,
        "affordances": { "approve": { "label": "Approve",
                                       "intent": "approve_pr_42" } },
    }),
)
session    = json_parse(resp.body)
surface    = session["url"]            # https://.../<session_id>
session_id = session["session_id"]

# 2. Deliver the URL to the user via whatever outbound channel applies.
deliver(surface)

# 3. Drain by polling /poll. Cursor starts at 0; advance to the largest
#    at_ms seen on each pass.
cursor   = 0
interval = 2  # seconds; pick based on task latency tolerance

while True:
    poll = http_get(BASE + "/" + session_id + "/poll?since=" + str(cursor))
    body = json_parse(poll.body)
    for entry in body["submissions"]:
        affordance_id = entry["id"]
        payload       = entry["payload"]
        intent        = AFFORDANCES.get(affordance_id, {}).get("intent")
        react(intent, payload)
        if entry["at_ms"] > cursor:
            cursor = entry["at_ms"]
        if is_terminal(intent, payload):
            cleanup(session_id)        # delete the KV state
            return
    sleep(interval)
```

What this *doesn't* prescribe, on purpose:

- **Cadence (`interval`).** Sub-second for an interactive session where the
  user is sitting at the URL; tens of seconds for an async approval gate;
  longer still for "check once an hour" workflows. Match the polling
  period to the task's latency tolerance — and to the platform's read
  budget (Cloudflare's free tier KV is 100k reads/day).
- **Cleanup.** When the session is terminal, the agent decides whether to
  delete the KV state immediately (tight) or let a sweeper Worker reap
  expired sessions (loose). The pattern doesn't pick.
- **Back-off.** Quota errors, rate limits, network blips — all handled by
  the agent's own retry policy. The drain loop is not the right place for
  bespoke exponential back-off; an outer supervisor that restarts the
  drain on transient failure is usually the cleaner shape.

Push (a webhook from the surface to an agent-owned endpoint) is the
alternative shape and is equally valid when the agent is addressable. The
worker reference doesn't ship a webhook variant; adding one is a matter
of wiring `fetch` on submit instead of a KV append.

## Cadence guidance

Push-driven mechanisms (subprocess stdout stream, filesystem watch, push webhook) deliver events at event-time — the agent reacts as soon as a submission lands. No cadence to tune.

Scheduled wake-up mechanisms trade latency for portability. Match the polling period to the task's latency tolerance: seconds for interactive approval gates where the user is sitting at the URL; minutes for async approval gates where the user may take a while; longer still for "check once an hour for a daily-digest reply." Don't poll faster than the task needs; the wake-up cost is real.

## When no submissions arrive

At some point the drain loop has been running long enough — or the cadence has fired enough times — that the agent must decide whether to keep waiting or give up. The pattern doesn't name that threshold. The agent does, based on what it knows about the recipient, the urgency, the channel, and the task.

### Recognizing the no-submission window

The question isn't "has the timeout elapsed?" — it's "do I have enough signal to conclude this surface isn't going to get submissions?" Useful signals: time since the surface was delivered, whether the URL was ever opened, what the agent knows about the recipient's schedule, and whether the task behind the surface is still relevant.

### Per-mechanism examples (cadence shapes, not prescriptions)

**Push-stream (subprocess stdout / Monitor).** The drain loop fires on arrival; no submissions means no events. If you've been tailing the server's stdout for a while and you know the recipient is in a different time zone and offline, you might decide to break out of the Monitor loop, leave the server running (or kill it), and re-deliver via a different channel — or file an ask for the operator. If the surface is a one-shot approval gate and the author of the PR has gone quiet for a weekend, breaking the loop after an extended quiet window and parking the approval is a reasonable call.

**Scheduled wake-ups.** Each wake-up is a natural checkpoint. If you've fired five wake-ups over a few hours and the state file still shows no submissions, you might decide the surface has been idle long enough to warrant action — especially if the underlying task has a deadline. Alternatively, a surface attached to a low-urgency daily-digest workflow might legitimately run for days with no submissions before the agent acts on the silence.

**Filesystem drop-directory watch.** The watcher fires on submissions; absence of events means no drops. If the directory has been empty across several watch intervals and the agent knows the surface was delivered to someone likely to respond quickly, silence is signal. If the surface is backing a batch-review queue that may go days between submissions, the same silence is expected.

**Push webhook.** The agent receives no callback. If a deadline has passed and the surface was sent to a recipient known to be responsive — and the webhook infrastructure is healthy — no callback after an extended window is meaningful signal to act on.

### Options when the agent decides to give up

These are not mutually exclusive and not ordered by preference. Pick what fits the task:

- **Discard the surface:** kill the server (if running), delete state files, and treat the surface as expired. Appropriate when the underlying task is no longer live, the deadline has passed, or the lack of response is itself a meaningful signal.
- **Re-deliver via a different channel:** if the original channel was email and the recipient hasn't responded, try a push notification or log a message somewhere the recipient is more likely to see it. `reach` is the preferred delivery tool when available.
- **File an ask for the operator:** if the decision can't be made without human judgment — e.g., "no one approved the PR; should I close it or escalate?" — file an ask rather than taking unilateral action.
- **Persist the affordance state for later resumption:** leave the server running (or the state file intact) and re-arm the drain on the next scheduled invocation. Useful when the surface is part of a long-running workflow that doesn't expect rapid turnaround.
- **Treat silence as a response:** for surfaces where "no action" has a defined meaning (a nightly review no one corrects means "everything is fine"), record the absence and move on.

The agent's knowledge of the task, the recipient, and the operational context determines which of these fits. The pattern names the options; the agent picks.

## Beyond the pattern

Timeouts (user never clicks), idempotency (the same submission seen twice — duplicate Monitor delivery, retried multipart upload), retry, recovery after server crash, concurrent surfaces, port choice, and state-file lifecycle are agent responsibilities, not pattern responsibilities. See `pattern.md` §"Beyond the pattern" for the full list. The pattern fixes the *requirement* of autonomous draining; the agent decides how robust the loop around it needs to be for the task at hand.

One specific operational hazard worth naming: if you reuse a port across surfaces, prior browser tabs cached on that URL will interact with whatever server is currently bound — possibly a new one rendering the wrong page. The reference server sends `Cache-Control: no-store, must-revalidate` on the served HTML to nudge browsers to refetch; agents that build their own wires should consider the same, or rotate ports per surface so cached tabs simply 404 against a closed port.
