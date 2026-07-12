# SSE return-path example

Illustrative substrate for the common asymmetric shape: **discrete inbound + live outbound push**. Peer to the WebSocket note in SKILL.md §8, not the contract (§3 is).

**When it fits.** Inbound is discrete — clicks, form posts — so the existing `POST /submit` wire (`wire-example.md`) is untouched. But the page must show agent-computed state without a reload: a computed result, a live tally, another recipient's move. One-directional server→page. No socket upgrade, no bidirectional framing.

**Shape.** The page opens `new EventSource('/events')`. The server holds that response open with `Content-Type: text/event-stream` and writes `data: <json>\n\n` frames as the agent produces state. Inbound stays ordinary POST — the whole existing wire example, drain paths, and intent map carry over unchanged. SSE is purely the return leg.

**Why lighter than a WebSocket.** No protocol upgrade, no duplex framing; `EventSource` auto-reconnects; it rides plain HTTP, so proxies and tunnels pass it. Reach for a WebSocket only when the page must stream *into* the agent continuously (live cursors, co-edit, drawing strokes) — SSE can't carry inbound.

**Boundary.** Illustrative. Frame count, retry/heartbeat interval, and whether the drain reads POSTs via stdout / fs / webhook are all implementation-defined. The wire envelope is unchanged.
