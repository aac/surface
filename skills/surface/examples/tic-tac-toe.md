# Example — tldraw tic-tac-toe

A worked capability demo: the surface is a tic-tac-toe board rendered with
[tldraw](https://tldraw.dev) (a frontend whiteboard SDK). A recipient opens a
URL and plays X by clicking squares; the agent drains each move off the wire,
plays O, and pushes the updated board back. It exercises every invariant in
`references/pattern.md` — opaque-ID affordances, an agent-owned `id → intent`
map, autonomous draining, typed-by-construction submissions, a task-shaped
ephemeral surface — on a richer rendering substrate than a plain form. The
"agent monitors game state" half is just the drain-and-react loop.

This is **illustrative, not normative**. tldraw, the nine-cell affordance
shape, the poll-for-reply mechanism, the loopback Go server — all are one set
of choices. The pattern survives if you swap every one of them.

`tic-tac-toe.html` is the recipient-facing page (read its top comment for how
the agent fills it in). It runs against the reference server in
`examples/server.go` with no modification — the demo speaks only the two
documented routes (`GET /`, `POST /submit`).

## How it maps onto the pattern

- **Mint opaque IDs.** The agent mints nine unguessable IDs, one per board cell
  (e.g. `c_5009e6c1ed`), and renders them into the page's `BOARD_STATE` block.
  The wire never inspects them; they're matched only by equality against the
  intent map.
- **Persist the intent map.** The surface state file
  (`references/wire-example.md` schema) carries `affordances` mapping each cell
  ID to its intent, e.g. `{ "kind": "place_mark", "cell": 4 }`. The agent owns
  this file.
- **Render the surface.** tldraw draws a 3×3 grid as four geo shapes and each
  played mark as a text shape. The canvas is read-only chrome; the page
  translates a pointer-down into the clicked cell index.
- **Typed submissions.** Clicking an empty cell POSTs
  `{ "id": "<cell-id>", "payload": { "player": "X", "cell": 4 } }` as
  `application/json` to `/submit`. The structure is fixed at design time, so
  the agent never parses intent out of prose.
- **Autonomous drain + react.** The server emits
  `SUBMIT c_5009e6c1ed {"player":"X","cell":4}` to stdout. The agent's drain
  loop (see `references/lifecycle.md`) splits on the first two spaces,
  JSON-parses the payload, looks the ID up in the intent map, records X's move
  in its own game-state model, checks for a win/draw, picks O's reply, and
  rewrites the served HTML's `BOARD_STATE` block. No recipient nudge through
  another channel — the agent learns of the move from the wire alone.
- **The surface owns the result** (SKILL.md §6 rule 5). O appears on the same
  board, not in chat. The page polls `GET /` on a short interval and reconciles
  any marks the agent set. Because `BOARD_STATE` is the agent's authoritative
  projection, the page never invents state.
- **Ephemeral.** When the game ends the agent sets `result` (e.g. `"O wins"`),
  tears down the server, and removes the state file. Nothing persists.

## Running it

The agent normally renders the page and starts the server itself. To run the
demo by hand:

1. Mint nine cell IDs and a session ID. Write the surface state file with an
   `affordances` map and an empty `submissions` array, per the locked schema in
   `references/wire-example.md` — each affordance value is `{label, intent}`,
   so a cell entry is `"<cell-id>": {"label": "cell 4", "intent": {"kind":
   "place_mark", "cell": 4}}`. (The `{kind, cell}` object is the *intent*; it
   nests inside the `{label, intent}` wrapper, it is not the affordance value
   itself.)
2. Copy `tic-tac-toe.html`, substituting the real session ID for
   `REPLACE_SESSION_ID` and each cell ID for `REPLACE_CELL_0..8` in the
   `BOARD_STATE` block.
3. Serve it (build from the module root — `go.mod` lives at `skills/surface/`,
   so `./examples/` only resolves from there):

   ```
   cd skills/surface
   go build -o /tmp/surface-serve ./examples/
   /tmp/surface-serve --state /tmp/ttt-state.json --html /tmp/ttt-page.html --port 5173
   ```

   If port 5173 is already in use, the server prints `bind: address already in
   use` and serves nothing — pick any free port. (Don't trust a `200` from
   `curl` alone: a stale dev server on the same port will answer with its own
   page, a confusing false success.)

4. Open `http://127.0.0.1:5173/` and click a square. The server prints a
   `SUBMIT` line; that's what the agent's drain loop consumes.
5. React: record the move, choose O's cell, and rewrite the `BOARD_STATE`
   block in the served HTML (keep the same cell IDs; set the `mark` fields and
   `turn`/`result`). The open page's poll picks up O within a second or two.

## Notes on the tldraw substrate

- **One React on the page.** tldraw renders with React, and its transitive
  dependencies will pull their own React copy from a CDN by default — two
  Reacts on one page breaks hooks (`Cannot read properties of null (reading
  'useRef')`). The page pins a single React via an import map and passes
  `?deps=react@…,react-dom@…` to the tldraw URL so every module shares one
  instance. Versions are pinned for reproducibility.
- **Create shapes before going read-only.** tldraw's readonly/edit-locked
  modes reject store mutations, so the board must be drawn before any such
  state is set. The page leaves the store writable (so the agent's reconcile
  can draw O) and simply ignores edit gestures other than cell clicks.
- **No build step.** The page loads tldraw from a CDN (esm.sh) at runtime, so
  the example is a single self-contained HTML file — no bundler, no
  `node_modules`. A production surface might vendor the SDK instead; for an
  ephemeral demo the CDN is the minimum-effort path.
