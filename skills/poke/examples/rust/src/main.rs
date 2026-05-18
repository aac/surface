// poke — Rust reference implementation of the canonical HTTP+JSON wire example.
//
// Built from references/{pattern,wire-example,lifecycle,security}.md only.
// Sibling to examples/server.go, examples/server.mjs, and the hosted worker.
//
// Crate picks (rationale):
// - tiny_http: smallest synchronous HTTP server with multipart-friendly request body access.
//   Rust's std doesn't include an HTTP server (Go's siblings here are stdlib-only; that floor
//   doesn't exist for Rust). Picked over hyper/axum because the canonical wire is single-process,
//   single-host, low concurrency — an async runtime would dwarf the actual server in code.
// - serde_json: de-facto JSON. Equivalent role to encoding/json in Go, JSON.parse in Node.
// - chrono: RFC3339 timestamp formatting. Wire reference allows microsecond precision; chrono
//   handles UTC/leap-second details so we don't reimplement them.
// - multipart: tiny_http has no built-in multipart parsing; the `multipart` crate's server
//   feature integrates with any std::io::Read source.
//
// Wire surface (matches references/wire-example.md):
//   GET  /                 — serves HTML from --html, Cache-Control: no-store
//   POST /submit           — application/json OR multipart/form-data
//                            multipart bodies are hard-capped at 32 MiB
//                            (MAX_MULTIPART_BYTES); over-cap returns 413
//                            Payload Too Large with no partial state
//                            side-effects, matching the Node reference.
//   GET  /static/<path>    — served from --static <dir> if the flag is provided
//
// State file (--state path), JSON:
//   { "session_id": "...", "affordances": {...}, "submissions": [...] }
//
// Drain modes:
//   stdout (default) — SUBMIT <id> <payload-json> single-line emission.
//   fs               — writes <state-dir>/submissions/<unix-ns>-<id>.json atomically;
//                      stdout stays quiet for the SUBMIT event.
//
// Parent-death watchdog: polls getppid(); if our original parent exits (the kernel
// reparents us, typically to 1), we shut down. Matches the orphan-mitigation note in
// references/wire-example.md.

use std::collections::BTreeMap;
use std::fs;
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use std::process;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use chrono::{SecondsFormat, Utc};
use multipart::server::Multipart;
use serde_json::{json, Value};
use tiny_http::{Header, Method, Request, Response, Server};

// Hard cap on multipart body size. Matches the Node reference (32 MiB);
// requests that exceed this return 413 Payload Too Large with no
// partial state side-effects (no upload file written, no SUBMIT line
// emitted, no state-file append). See references/wire-example.md
// §"multipart/form-data — file uploads", "Body-size cap" paragraph.
const MAX_MULTIPART_BYTES: u64 = 32 << 20;

// --- CLI parsing (deliberately minimal; no clap to keep the dep set small) ----------------

#[derive(Clone, Debug)]
struct Args {
    state: PathBuf,
    html: PathBuf,
    static_dir: Option<PathBuf>,
    port: u16,
    drain_mode: DrainMode,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum DrainMode {
    Stdout,
    Fs,
}

fn parse_args() -> Result<Args, String> {
    let mut state: Option<PathBuf> = None;
    let mut html: Option<PathBuf> = None;
    let mut static_dir: Option<PathBuf> = None;
    let mut port: u16 = 5173;
    let mut drain_mode = DrainMode::Stdout;

    let argv: Vec<String> = std::env::args().collect();
    let mut i = 1;
    while i < argv.len() {
        let arg = &argv[i];
        let (key, inline_val) = if let Some(eq) = arg.find('=') {
            (&arg[..eq], Some(arg[eq + 1..].to_string()))
        } else {
            (arg.as_str(), None)
        };
        let take_value = |i: &mut usize| -> Result<String, String> {
            if let Some(v) = inline_val.clone() {
                Ok(v)
            } else {
                *i += 1;
                argv.get(*i)
                    .cloned()
                    .ok_or_else(|| format!("missing value for {}", key))
            }
        };
        match key {
            "--state" => state = Some(PathBuf::from(take_value(&mut i)?)),
            "--html" => html = Some(PathBuf::from(take_value(&mut i)?)),
            "--static" => static_dir = Some(PathBuf::from(take_value(&mut i)?)),
            "--port" => {
                let v = take_value(&mut i)?;
                port = v.parse().map_err(|_| format!("invalid --port: {}", v))?;
            }
            "--drain-mode" => {
                let v = take_value(&mut i)?;
                drain_mode = match v.as_str() {
                    "stdout" => DrainMode::Stdout,
                    "fs" => DrainMode::Fs,
                    other => return Err(format!("invalid --drain-mode: {}", other)),
                };
            }
            "-h" | "--help" => {
                eprintln!(
                    "usage: poke-rust-server --state <path> --html <path> [--static <dir>] [--port 5173] [--drain-mode stdout|fs]"
                );
                process::exit(0);
            }
            other => return Err(format!("unknown flag: {}", other)),
        }
        i += 1;
    }

    Ok(Args {
        state: state.ok_or_else(|| "--state required".to_string())?,
        html: html.ok_or_else(|| "--html required".to_string())?,
        static_dir,
        port,
        drain_mode,
    })
}

// --- State (the agent-owned intent map plus the submission log) --------------------------

struct StateStore {
    path: PathBuf,
}

impl StateStore {
    fn new(path: PathBuf) -> Self {
        Self { path }
    }

    fn load(&self) -> Result<Value, String> {
        let bytes = fs::read(&self.path).map_err(|e| format!("read state: {}", e))?;
        serde_json::from_slice(&bytes).map_err(|e| format!("parse state: {}", e))
    }

    /// Append a submission to state.submissions and atomically rewrite the file.
    fn append_submission(&self, entry: Value) -> Result<(), String> {
        let mut state = self.load()?;
        let submissions = state
            .as_object_mut()
            .and_then(|o| o.get_mut("submissions"))
            .and_then(|v| v.as_array_mut())
            .ok_or_else(|| "state.submissions is not an array".to_string())?;
        submissions.push(entry);
        self.atomic_write(&state)
    }

    fn atomic_write(&self, state: &Value) -> Result<(), String> {
        let dir = self
            .path
            .parent()
            .ok_or_else(|| "state path has no parent".to_string())?;
        let tmp = dir.join(format!(
            ".{}.tmp.{}",
            self.path
                .file_name()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| "state".into()),
            process::id()
        ));
        let bytes = serde_json::to_vec_pretty(state).map_err(|e| e.to_string())?;
        fs::write(&tmp, &bytes).map_err(|e| format!("write tmp: {}", e))?;
        fs::rename(&tmp, &self.path).map_err(|e| format!("rename: {}", e))?;
        Ok(())
    }
}

// --- Submission emission (stdout SUBMIT line OR fs drop-directory) -----------------------

struct Emitter {
    mode: DrainMode,
    state_dir: PathBuf,
}

impl Emitter {
    fn new(mode: DrainMode, state_path: &Path) -> Self {
        let state_dir = state_path
            .parent()
            .map(|p| p.to_path_buf())
            .unwrap_or_else(|| PathBuf::from("."));
        Self { mode, state_dir }
    }

    fn emit(&self, id: &str, payload: &Value, at: &str) -> Result<(), String> {
        match self.mode {
            DrainMode::Stdout => {
                let payload_line =
                    serde_json::to_string(payload).map_err(|e| e.to_string())?;
                // Single-line guarantee: serde_json::to_string never injects newlines.
                let mut stdout = std::io::stdout().lock();
                writeln!(stdout, "SUBMIT {} {}", id, payload_line)
                    .map_err(|e| e.to_string())?;
                stdout.flush().map_err(|e| e.to_string())?;
                Ok(())
            }
            DrainMode::Fs => {
                let dir = self.state_dir.join("submissions");
                fs::create_dir_all(&dir).map_err(|e| format!("mkdir submissions: {}", e))?;
                let now_ns = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .map(|d| d.as_nanos())
                    .unwrap_or(0);
                let fname = format!("{}-{}.json", now_ns, sanitize_filename(id));
                let final_path = dir.join(&fname);
                let tmp_path = dir.join(format!(".{}.tmp.{}", fname, process::id()));
                let body = json!({
                    "id": id,
                    "payload": payload,
                    "at": at,
                });
                let bytes = serde_json::to_vec(&body).map_err(|e| e.to_string())?;
                fs::write(&tmp_path, &bytes).map_err(|e| format!("write tmp: {}", e))?;
                fs::rename(&tmp_path, &final_path).map_err(|e| format!("rename: {}", e))?;
                Ok(())
            }
        }
    }
}

fn cleanup_partial_uploads(paths: &[PathBuf]) {
    for p in paths {
        let _ = fs::remove_file(p);
    }
}

fn sanitize_filename(s: &str) -> String {
    s.chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect()
}

// --- HTTP handlers ------------------------------------------------------------------------

fn handle_root(args: &Args) -> Response<std::io::Cursor<Vec<u8>>> {
    match fs::read(&args.html) {
        Ok(bytes) => Response::from_data(bytes)
            .with_status_code(200)
            .with_header(header("Content-Type", "text/html; charset=utf-8"))
            .with_header(header("Cache-Control", "no-store, must-revalidate")),
        Err(e) => Response::from_string(format!("html read error: {}\n", e))
            .with_status_code(500),
    }
}

fn handle_static(args: &Args, url_path: &str) -> Response<std::io::Cursor<Vec<u8>>> {
    let base = match &args.static_dir {
        Some(p) => p,
        None => return Response::from_string("not found\n").with_status_code(404),
    };
    // Strip leading "/static/".
    let rel = url_path.trim_start_matches("/static/");
    // Reject anything containing ".." for basic path traversal mitigation.
    if rel.split('/').any(|seg| seg == ".." || seg.is_empty()) {
        return Response::from_string("bad path\n").with_status_code(400);
    }
    let full = base.join(rel);
    if !full.starts_with(base) {
        return Response::from_string("bad path\n").with_status_code(400);
    }
    match fs::read(&full) {
        Ok(bytes) => Response::from_data(bytes)
            .with_status_code(200)
            .with_header(header("Cache-Control", "no-store, must-revalidate")),
        Err(_) => Response::from_string("not found\n").with_status_code(404),
    }
}

fn handle_submit(
    request: &mut Request,
    state: &Arc<Mutex<StateStore>>,
    emitter: &Arc<Emitter>,
) -> Response<std::io::Cursor<Vec<u8>>> {
    let ct_raw = request
        .headers()
        .iter()
        .find(|h| h.field.equiv("Content-Type"))
        .map(|h| h.value.as_str().to_string())
        .unwrap_or_default();
    // HTTP Content-Type is case-insensitive in the media-type token. Lower-case
    // the comparison view; preserve the raw header for boundary extraction
    // (the boundary value itself is case-sensitive per RFC 2046).
    let ct_lower = ct_raw.to_ascii_lowercase();
    let base_ct = ct_lower
        .split(';')
        .next()
        .map(|s| s.trim().to_string())
        .unwrap_or_default();

    match base_ct.as_str() {
        "application/json" => {
            // fall through to JSON path below
        }
        "multipart/form-data" => {
            let boundary = match ct_raw.split("boundary=").nth(1) {
                Some(b) => b.trim_matches('"').to_string(),
                None => {
                    return Response::from_string("missing multipart boundary\n")
                        .with_status_code(400)
                }
            };
            return handle_multipart_submit(request, state, emitter, &boundary);
        }
        _ => {
            // application/x-www-form-urlencoded and anything else: refuse.
            return Response::from_string(
                "unsupported content type; use application/json or multipart/form-data\n",
            )
            .with_status_code(415);
        }
    }

    let mut body = String::new();
    if let Err(e) = request.as_reader().read_to_string(&mut body) {
        return Response::from_string(format!("read body: {}\n", e)).with_status_code(400);
    }
    let parsed: Value = match serde_json::from_str(&body) {
        Ok(v) => v,
        Err(e) => {
            return Response::from_string(format!("invalid json: {}\n", e))
                .with_status_code(400)
        }
    };
    let id = match parsed.get("id").and_then(|v| v.as_str()) {
        Some(s) if !s.is_empty() => s.to_string(),
        _ => {
            return Response::from_string("missing or non-string id\n")
                .with_status_code(400)
        }
    };
    let payload = parsed.get("payload").cloned().unwrap_or(Value::Null);

    record_and_emit(state, emitter, &id, &payload)
}

/// Reader adapter that fails with `ErrorKind::Other` (carrying the
/// sentinel message used by `is_cap_exceeded`) once `limit` bytes have
/// been read. The multipart parser drives reads through this adapter,
/// so over-cap bodies surface as a parse error before any file is
/// flushed to disk.
struct CapReader<R> {
    inner: R,
    read: u64,
    limit: u64,
}

impl<R: Read> CapReader<R> {
    fn new(inner: R, limit: u64) -> Self {
        Self { inner, read: 0, limit }
    }
}

const CAP_EXCEEDED_MARKER: &str = "poke:multipart-cap-exceeded";

fn is_cap_exceeded(err: &str) -> bool {
    err.contains(CAP_EXCEEDED_MARKER)
}

impl<R: Read> Read for CapReader<R> {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        let remaining = self.limit.saturating_sub(self.read);
        if remaining == 0 {
            // Probe one more byte: if the source has nothing left, EOF
            // (under-cap body that happens to land exactly on the limit
            // boundary). If it does, the body exceeds the cap.
            let mut probe = [0u8; 1];
            return match self.inner.read(&mut probe)? {
                0 => Ok(0),
                _ => Err(io::Error::new(io::ErrorKind::Other, CAP_EXCEEDED_MARKER)),
            };
        }
        let cap = std::cmp::min(buf.len() as u64, remaining) as usize;
        let n = self.inner.read(&mut buf[..cap])?;
        self.read += n as u64;
        Ok(n)
    }
}

fn handle_multipart_submit(
    request: &mut Request,
    state: &Arc<Mutex<StateStore>>,
    emitter: &Arc<Emitter>,
    boundary: &str,
) -> Response<std::io::Cursor<Vec<u8>>> {
    // Pre-flight: if Content-Length is present and over cap, reject
    // before touching the body or creating any upload directory.
    if let Some(len) = request.body_length() {
        if (len as u64) > MAX_MULTIPART_BYTES {
            return Response::from_string("payload too large\n").with_status_code(413);
        }
    }

    let reader = CapReader::new(request.as_reader(), MAX_MULTIPART_BYTES);
    let mut mp = Multipart::with_body(reader, boundary);
    let mut id: Option<String> = None;
    let mut files: Vec<String> = Vec::new();
    let mut other: BTreeMap<String, Value> = BTreeMap::new();

    let upload_dir = std::env::temp_dir().join(format!("poke-uploads-{}", process::id()));
    if let Err(e) = fs::create_dir_all(&upload_dir) {
        return Response::from_string(format!("mkdir uploads: {}\n", e))
            .with_status_code(500);
    }

    // Track files we create so we can clean them up if the body turns
    // out to be over-cap mid-stream (cap rejection must have no
    // partial side-effects).
    let mut written_paths: Vec<PathBuf> = Vec::new();

    loop {
        match mp.read_entry() {
            Ok(Some(mut field)) => {
                let name = field.headers.name.to_string();
                if let Some(filename) = field.headers.filename.clone() {
                    // File field — stream to disk.
                    let safe = sanitize_filename(&filename);
                    let ts = SystemTime::now()
                        .duration_since(UNIX_EPOCH)
                        .map(|d| d.as_nanos())
                        .unwrap_or(0);
                    let dest = upload_dir.join(format!("{}-{}", ts, safe));
                    match fs::File::create(&dest) {
                        Ok(mut f) => {
                            if let Err(e) = std::io::copy(&mut field.data, &mut f) {
                                written_paths.push(dest.clone());
                                if is_cap_exceeded(&e.to_string()) {
                                    cleanup_partial_uploads(&written_paths);
                                    return Response::from_string("payload too large\n")
                                        .with_status_code(413);
                                }
                                return Response::from_string(format!("write upload: {}\n", e))
                                    .with_status_code(500);
                            }
                        }
                        Err(e) => {
                            return Response::from_string(format!("create upload: {}\n", e))
                                .with_status_code(500)
                        }
                    }
                    written_paths.push(dest.clone());
                    files.push(dest.to_string_lossy().to_string());
                } else {
                    // Text field.
                    let mut buf = String::new();
                    if let Err(e) = field.data.read_to_string(&mut buf) {
                        if is_cap_exceeded(&e.to_string()) {
                            cleanup_partial_uploads(&written_paths);
                            return Response::from_string("payload too large\n")
                                .with_status_code(413);
                        }
                        return Response::from_string(format!("read field: {}\n", e))
                            .with_status_code(400);
                    }
                    if name == "id" {
                        id = Some(buf);
                    } else {
                        other.insert(name, Value::String(buf));
                    }
                }
            }
            Ok(None) => break,
            Err(e) => {
                let msg = e.to_string();
                if is_cap_exceeded(&msg) {
                    cleanup_partial_uploads(&written_paths);
                    return Response::from_string("payload too large\n")
                        .with_status_code(413);
                }
                return Response::from_string(format!("multipart parse: {}\n", msg))
                    .with_status_code(400);
            }
        }
    }

    let id = match id {
        Some(s) if !s.is_empty() => s,
        _ => {
            return Response::from_string("missing id field in multipart\n")
                .with_status_code(400)
        }
    };

    let mut payload_map = serde_json::Map::new();
    payload_map.insert("files".to_string(), Value::Array(files.into_iter().map(Value::String).collect()));
    for (k, v) in other {
        payload_map.insert(k, v);
    }
    let payload = Value::Object(payload_map);

    record_and_emit(state, emitter, &id, &payload)
}

fn record_and_emit(
    state: &Arc<Mutex<StateStore>>,
    emitter: &Arc<Emitter>,
    id: &str,
    payload: &Value,
) -> Response<std::io::Cursor<Vec<u8>>> {
    let at = Utc::now().to_rfc3339_opts(SecondsFormat::Micros, true);
    let entry = json!({
        "id": id,
        "payload": payload,
        "at": at,
    });
    {
        let guard = match state.lock() {
            Ok(g) => g,
            Err(p) => p.into_inner(),
        };
        if let Err(e) = guard.append_submission(entry) {
            return Response::from_string(format!("state write: {}\n", e))
                .with_status_code(500);
        }
    }
    if let Err(e) = emitter.emit(id, payload, &at) {
        return Response::from_string(format!("emit: {}\n", e)).with_status_code(500);
    }
    Response::from_string("").with_status_code(200)
}

fn header(name: &str, value: &str) -> Header {
    Header::from_bytes(name.as_bytes(), value.as_bytes()).expect("valid header")
}

// --- Parent-death watchdog (Unix; macOS has no PR_SET_PDEATHSIG so we poll getppid) -----

#[cfg(unix)]
fn spawn_parent_watchdog() {
    use std::os::raw::c_int;
    extern "C" {
        fn getppid() -> c_int;
    }
    let original_parent = unsafe { getppid() };
    if original_parent <= 1 {
        // Already orphaned at startup (or running under init); no watchdog useful.
        return;
    }
    thread::spawn(move || loop {
        thread::sleep(Duration::from_millis(500));
        let now_parent = unsafe { getppid() };
        if now_parent != original_parent {
            eprintln!(
                "poke: parent process {} exited (now {}); shutting down",
                original_parent, now_parent
            );
            process::exit(0);
        }
    });
}

#[cfg(not(unix))]
fn spawn_parent_watchdog() {
    // No-op on non-unix targets; the orphan hazard is process-model-specific.
}

// --- main --------------------------------------------------------------------------------

fn run(args: Args) -> Result<(), String> {
    // Eagerly validate paths so misconfiguration fails before binding the port.
    let _ = fs::read(&args.state).map_err(|e| format!("--state unreadable: {}", e))?;
    let _ = fs::metadata(&args.html).map_err(|e| format!("--html unreadable: {}", e))?;
    if let Some(d) = &args.static_dir {
        let _ = fs::metadata(d).map_err(|e| format!("--static unreadable: {}", e))?;
    }

    let addr = format!("127.0.0.1:{}", args.port);
    let server = Server::http(&addr).map_err(|e| format!("bind {}: {}", addr, e))?;
    let state = Arc::new(Mutex::new(StateStore::new(args.state.clone())));
    let emitter = Arc::new(Emitter::new(args.drain_mode, &args.state));

    // Startup banner on stderr so it doesn't pollute the stdout drain stream.
    eprintln!(
        "poke-rust-server listening on http://{} (drain={:?}, state={}, html={})",
        addr,
        args.drain_mode,
        args.state.display(),
        args.html.display()
    );

    spawn_parent_watchdog();

    for mut req in server.incoming_requests() {
        let url = req.url().to_string();
        let method = req.method().clone();
        let args_clone = args.clone();
        let state_clone = Arc::clone(&state);
        let emitter_clone = Arc::clone(&emitter);

        let resp = match (&method, url.as_str()) {
            (Method::Get, "/") => handle_root(&args_clone),
            (Method::Get, p) if p.starts_with("/static/") => handle_static(&args_clone, p),
            (Method::Post, "/submit") => handle_submit(&mut req, &state_clone, &emitter_clone),
            _ => Response::from_string("not found\n").with_status_code(404),
        };
        if let Err(e) = req.respond(resp) {
            eprintln!("respond error: {}", e);
        }
    }
    Ok(())
}

fn main() {
    let args = match parse_args() {
        Ok(a) => a,
        Err(e) => {
            eprintln!("error: {}", e);
            process::exit(2);
        }
    };
    if let Err(e) = run(args) {
        eprintln!("fatal: {}", e);
        process::exit(1);
    }
}

// --- Unit tests (state-store, submit-line contract; no spawned server) -----------------

#[cfg(test)]
mod tests {
    use super::*;

    fn tempdir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "poke-rust-unit-{}-{}",
            process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn atomic_state_write_appends_submission() {
        let dir = tempdir();
        let state_path = dir.join("state.json");
        fs::write(
            &state_path,
            serde_json::to_vec(&json!({
                "session_id": "s",
                "affordances": {},
                "submissions": []
            }))
            .unwrap(),
        )
        .unwrap();
        let store = StateStore::new(state_path.clone());
        store
            .append_submission(json!({
                "id": "abc123", "payload": null, "at": "2026-05-16T00:00:00Z"
            }))
            .unwrap();
        let on_disk: Value =
            serde_json::from_slice(&fs::read(&state_path).unwrap()).unwrap();
        let subs = on_disk["submissions"].as_array().unwrap();
        assert_eq!(subs.len(), 1);
        assert_eq!(subs[0]["id"], "abc123");
    }

    #[test]
    fn submit_line_split_contract_holds_for_complex_payload() {
        // Wire contract: split SUBMIT line on the first two spaces, JSON-parse the rest.
        let payload =
            json!({"selected": ["a", "b", "c"], "text": "multi\nline\nthing"});
        let line = format!(
            "SUBMIT {} {}",
            "abc123",
            serde_json::to_string(&payload).unwrap()
        );
        assert_eq!(line.lines().count(), 1, "SUBMIT line must be single-line");
        let mut parts = line.splitn(3, ' ');
        assert_eq!(parts.next(), Some("SUBMIT"));
        assert_eq!(parts.next(), Some("abc123"));
        let parsed: Value = serde_json::from_str(parts.next().unwrap()).unwrap();
        assert_eq!(parsed["text"], "multi\nline\nthing");
    }
}
