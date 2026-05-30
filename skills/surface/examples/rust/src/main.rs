//! surface-server — Rust reference implementation of the surface wire example.
//!
//! Derived from `skills/surface/references/wire-example.md` and
//! `skills/surface/references/pattern.md` only.  No sibling implementations
//! were consulted.
//!
//! Usage:
//!   surface-server --state <path> --html <path> --port <port>
//!
//! Routes:
//!   GET /            — serve the agent-rendered HTML
//!   POST /submit     — accept application/json or multipart/form-data
//!
//! Each accepted submission atomically appends to the state file and emits:
//!   SUBMIT <id> <payload-json>
//! to stdout, one line per submission.

use std::{
    collections::HashMap,
    env,
    fmt::Write as FmtWrite,
    fs,
    io::{BufRead, BufReader, Read, Write},
    net::{TcpListener, TcpStream},
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};

// ── State schema ─────────────────────────────────────────────────────────────

/// The on-disk state file, schema locked per wire-example.md.
#[derive(Debug, Clone)]
struct State {
    session_id: String,
    affordances: HashMap<String, Affordance>,
    submissions: Vec<Submission>,
}

#[derive(Debug, Clone)]
struct Affordance {
    label: String,
    /// Stored as raw JSON (string, object, array — any JSON value).
    intent: String,
}

#[derive(Debug, Clone)]
struct Submission {
    id: String,
    /// Raw JSON value, "null" if missing.
    payload: String,
    /// RFC3339 timestamp (microsecond precision).
    at: String,
}

// ── JSON helpers (std-only, no serde) ────────────────────────────────────────

/// Escape a Rust string for inclusion inside a JSON double-quoted string.
fn json_escape(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => {
                let _ = write!(out, "\\u{:04x}", c as u32);
            }
            c => out.push(c),
        }
    }
    out
}

/// Render `State` to its canonical JSON form.
fn state_to_json(state: &State) -> String {
    let mut out = String::new();
    out.push_str("{\n");
    out.push_str("  \"session_id\": \"");
    out.push_str(&json_escape(&state.session_id));
    out.push_str("\",\n");
    out.push_str("  \"affordances\": {");
    let mut aff_entries: Vec<_> = state.affordances.iter().collect();
    aff_entries.sort_by_key(|(k, _)| k.as_str());
    for (i, (id, aff)) in aff_entries.iter().enumerate() {
        out.push_str("\n    \"");
        out.push_str(&json_escape(id));
        out.push_str("\": {\"label\": \"");
        out.push_str(&json_escape(&aff.label));
        out.push_str("\", \"intent\": ");
        out.push_str(&aff.intent);
        out.push('}');
        if i + 1 < aff_entries.len() {
            out.push(',');
        }
    }
    if !aff_entries.is_empty() {
        out.push_str("\n  ");
    }
    out.push_str("},\n");
    out.push_str("  \"submissions\": [");
    for (i, sub) in state.submissions.iter().enumerate() {
        out.push_str("\n    {\"id\": \"");
        out.push_str(&json_escape(&sub.id));
        out.push_str("\", \"payload\": ");
        out.push_str(&sub.payload);
        out.push_str(", \"at\": \"");
        out.push_str(&json_escape(&sub.at));
        out.push_str("\"}");
        if i + 1 < state.submissions.len() {
            out.push(',');
        }
    }
    if !state.submissions.is_empty() {
        out.push_str("\n  ");
    }
    out.push_str("]\n}");
    out
}

/// Parse the JSON state file.  Minimal hand-written parser — no external deps.
fn parse_state(json: &str) -> Result<State, String> {
    let mut p = Parser::new(json);
    p.parse_state()
}

// ─── Tiny JSON parser ───────────────────────────────────────────────────────

struct Parser<'a> {
    src: &'a [u8],
    pos: usize,
}

impl<'a> Parser<'a> {
    fn new(src: &'a str) -> Self {
        Self { src: src.as_bytes(), pos: 0 }
    }

    fn peek(&self) -> Option<u8> {
        self.src.get(self.pos).copied()
    }

    fn advance(&mut self) -> Option<u8> {
        let b = self.peek()?;
        self.pos += 1;
        Some(b)
    }

    fn skip_ws(&mut self) {
        while matches!(self.peek(), Some(b' ' | b'\t' | b'\r' | b'\n')) {
            self.pos += 1;
        }
    }

    fn expect(&mut self, b: u8) -> Result<(), String> {
        self.skip_ws();
        match self.advance() {
            Some(got) if got == b => Ok(()),
            Some(got) => Err(format!("expected '{}' got '{}'", b as char, got as char)),
            None => Err(format!("expected '{}' got EOF", b as char)),
        }
    }

    fn parse_string(&mut self) -> Result<String, String> {
        self.skip_ws();
        self.expect(b'"')?;
        let mut s = String::new();
        loop {
            match self.advance() {
                Some(b'"') => break,
                Some(b'\\') => match self.advance() {
                    Some(b'"') => s.push('"'),
                    Some(b'\\') => s.push('\\'),
                    Some(b'/') => s.push('/'),
                    Some(b'n') => s.push('\n'),
                    Some(b'r') => s.push('\r'),
                    Some(b't') => s.push('\t'),
                    Some(b'u') => {
                        // 4-hex unicode escape
                        let mut hex = [0u8; 4];
                        for h in &mut hex {
                            *h = self.advance().ok_or("unexpected EOF in \\u escape")?;
                        }
                        let code = u32::from_str_radix(
                            std::str::from_utf8(&hex).map_err(|e| e.to_string())?,
                            16,
                        )
                        .map_err(|e| e.to_string())?;
                        s.push(char::from_u32(code).ok_or("invalid unicode codepoint")?);
                    }
                    Some(b) => s.push(b as char),
                    None => return Err("unexpected EOF in string escape".into()),
                },
                Some(b) => s.push(b as char),
                None => return Err("unexpected EOF in string".into()),
            }
        }
        Ok(s)
    }

    /// Parse any JSON value and return it as a raw JSON string.
    fn parse_value_raw(&mut self) -> Result<String, String> {
        self.skip_ws();
        let start = self.pos;
        match self.peek() {
            Some(b'"') => {
                let s = self.parse_string()?;
                Ok(format!("\"{}\"", json_escape(&s)))
            }
            Some(b'{') => {
                self.advance();
                self.skip_ws();
                if self.peek() == Some(b'}') {
                    self.advance();
                    return Ok("{}".into());
                }
                let mut out = String::from("{");
                let mut first = true;
                loop {
                    if !first {
                        self.expect(b',')?;
                    }
                    first = false;
                    self.skip_ws();
                    if self.peek() == Some(b'}') {
                        break;
                    }
                    let k = self.parse_string()?;
                    self.expect(b':')?;
                    let v = self.parse_value_raw()?;
                    let _ = write!(out, "\"{}\":{}", json_escape(&k), v);
                    self.skip_ws();
                    if self.peek() == Some(b'}') {
                        break;
                    }
                }
                self.expect(b'}')?;
                out.push('}');
                Ok(out)
            }
            Some(b'[') => {
                self.advance();
                self.skip_ws();
                if self.peek() == Some(b']') {
                    self.advance();
                    return Ok("[]".into());
                }
                let mut out = String::from("[");
                let mut first = true;
                loop {
                    if !first {
                        self.expect(b',')?;
                    }
                    first = false;
                    self.skip_ws();
                    if self.peek() == Some(b']') {
                        break;
                    }
                    let v = self.parse_value_raw()?;
                    out.push_str(&v);
                    self.skip_ws();
                    if self.peek() == Some(b']') {
                        break;
                    }
                }
                self.expect(b']')?;
                out.push(']');
                Ok(out)
            }
            Some(b't') => {
                for expected in b"true" {
                    if self.advance() != Some(*expected) {
                        return Err("invalid token (expected 'true')".into());
                    }
                }
                Ok("true".into())
            }
            Some(b'f') => {
                for expected in b"false" {
                    if self.advance() != Some(*expected) {
                        return Err("invalid token (expected 'false')".into());
                    }
                }
                Ok("false".into())
            }
            Some(b'n') => {
                for expected in b"null" {
                    if self.advance() != Some(*expected) {
                        return Err("invalid token (expected 'null')".into());
                    }
                }
                Ok("null".into())
            }
            Some(b) if b == b'-' || b.is_ascii_digit() => {
                // Consume a number token.
                let num_start = self.pos;
                while matches!(
                    self.peek(),
                    Some(b'-' | b'+' | b'.' | b'e' | b'E' | b'0'..=b'9')
                ) {
                    self.advance();
                }
                let raw = std::str::from_utf8(&self.src[num_start..self.pos])
                    .map_err(|e| e.to_string())?;
                Ok(raw.to_owned())
            }
            _ => Err(format!("unexpected byte at pos {}: {:?}", start, self.peek())),
        }
    }

    fn parse_state(&mut self) -> Result<State, String> {
        self.expect(b'{')?;
        let mut session_id = String::new();
        let mut affordances = HashMap::new();
        let mut submissions = Vec::new();

        loop {
            self.skip_ws();
            if self.peek() == Some(b'}') {
                self.advance();
                break;
            }
            let key = self.parse_string()?;
            self.expect(b':')?;
            match key.as_str() {
                "session_id" => {
                    session_id = self.parse_string()?;
                }
                "affordances" => {
                    self.expect(b'{')?;
                    loop {
                        self.skip_ws();
                        if self.peek() == Some(b'}') {
                            self.advance();
                            break;
                        }
                        let id = self.parse_string()?;
                        self.expect(b':')?;
                        // Parse { label, intent }
                        self.expect(b'{')?;
                        let mut label = String::new();
                        let mut intent = String::from("null");
                        loop {
                            self.skip_ws();
                            if self.peek() == Some(b'}') {
                                self.advance();
                                break;
                            }
                            let fk = self.parse_string()?;
                            self.expect(b':')?;
                            match fk.as_str() {
                                "label" => label = self.parse_string()?,
                                "intent" => intent = self.parse_value_raw()?,
                                _ => {
                                    self.parse_value_raw()?;
                                }
                            }
                            self.skip_ws();
                            if self.peek() == Some(b',') {
                                self.advance();
                            }
                        }
                        affordances.insert(id, Affordance { label, intent });
                        self.skip_ws();
                        if self.peek() == Some(b',') {
                            self.advance();
                        }
                    }
                }
                "submissions" => {
                    self.expect(b'[')?;
                    loop {
                        self.skip_ws();
                        if self.peek() == Some(b']') {
                            self.advance();
                            break;
                        }
                        // Parse { id, payload, at }
                        self.expect(b'{')?;
                        let mut sub_id = String::new();
                        let mut payload = String::from("null");
                        let mut at = String::new();
                        loop {
                            self.skip_ws();
                            if self.peek() == Some(b'}') {
                                self.advance();
                                break;
                            }
                            let fk = self.parse_string()?;
                            self.expect(b':')?;
                            match fk.as_str() {
                                "id" => sub_id = self.parse_string()?,
                                "payload" => payload = self.parse_value_raw()?,
                                "at" => at = self.parse_string()?,
                                _ => {
                                    self.parse_value_raw()?;
                                }
                            }
                            self.skip_ws();
                            if self.peek() == Some(b',') {
                                self.advance();
                            }
                        }
                        submissions.push(Submission { id: sub_id, payload, at });
                        self.skip_ws();
                        if self.peek() == Some(b',') {
                            self.advance();
                        }
                    }
                }
                _ => {
                    self.parse_value_raw()?;
                }
            }
            self.skip_ws();
            if self.peek() == Some(b',') {
                self.advance();
            }
        }
        Ok(State { session_id, affordances, submissions })
    }
}

// ── Timestamp ────────────────────────────────────────────────────────────────

/// Return current time as an RFC3339 string with microsecond precision (UTC).
fn rfc3339_now() -> String {
    let d = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system time before epoch");
    let total_secs = d.as_secs();
    let micros = d.subsec_micros();

    let (year, month, day, hour, min, sec) = unix_to_datetime(total_secs);
    format!("{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.{:06}Z", year, month, day, hour, min, sec, micros)
}

/// Convert UNIX seconds to (year, month, day, hour, min, sec) UTC.
/// Algorithm: https://howardhinnant.github.io/date_algorithms.html "civil_from_days"
fn unix_to_datetime(secs: u64) -> (u32, u32, u32, u32, u32, u32) {
    let sec = (secs % 60) as u32;
    let minutes = secs / 60;
    let min = (minutes % 60) as u32;
    let hours = minutes / 60;
    let hour = (hours % 24) as u32;
    let days = (hours / 24) as u32; // days since 1970-01-01

    let z = days + 719468;
    let era = z / 146097;
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };

    (y, m, d, hour, min, sec)
}

// ── Random ID ────────────────────────────────────────────────────────────────

/// Generate a random 16-byte hex ID using /dev/urandom.
fn random_hex_id() -> String {
    let mut buf = [0u8; 16];
    let mut f = fs::File::open("/dev/urandom").expect("cannot open /dev/urandom");
    f.read_exact(&mut buf).expect("cannot read /dev/urandom");
    buf.iter().fold(String::with_capacity(32), |mut s, b| {
        let _ = write!(s, "{:02x}", b);
        s
    })
}

// ── Atomic state write ───────────────────────────────────────────────────────

/// Append one submission to the state file using rename-atomicity.
fn append_submission(
    state_path: &Path,
    mu: &Mutex<()>,
    id: &str,
    payload: &str,
    at: &str,
) -> Result<(), String> {
    let _guard = mu.lock().unwrap();
    let contents = fs::read_to_string(state_path)
        .map_err(|e| format!("read state: {e}"))?;
    let mut state = parse_state(&contents)?;
    state.submissions.push(Submission {
        id: id.to_owned(),
        payload: payload.to_owned(),
        at: at.to_owned(),
    });
    let new_json = state_to_json(&state);
    // Write to a temp file in the same directory, then rename over.
    let dir = state_path.parent().unwrap_or(Path::new("."));
    let tmp_path = dir.join(format!(".surface-tmp-{}", random_hex_id()));
    let mut tmp = fs::File::create(&tmp_path)
        .map_err(|e| format!("create tmp: {e}"))?;
    tmp.write_all(new_json.as_bytes())
        .map_err(|e| format!("write tmp: {e}"))?;
    drop(tmp); // close before rename
    fs::rename(&tmp_path, state_path)
        .map_err(|e| format!("rename: {e}"))?;
    Ok(())
}

// ── HTTP primitives ──────────────────────────────────────────────────────────

struct Request {
    method: String,
    path: String,
    headers: HashMap<String, String>,
    body: Vec<u8>,
}

fn read_request(stream: &mut TcpStream) -> Option<Request> {
    let mut reader = BufReader::new(stream);
    let mut line = String::new();
    reader.read_line(&mut line).ok()?;
    let parts: Vec<&str> = line.trim_end().splitn(3, ' ').collect();
    if parts.len() < 2 {
        return None;
    }
    let method = parts[0].to_string();
    let path = parts[1].to_string();

    let mut headers = HashMap::new();
    loop {
        let mut h = String::new();
        reader.read_line(&mut h).ok()?;
        let h = h.trim_end();
        if h.is_empty() {
            break;
        }
        if let Some((k, v)) = h.split_once(": ") {
            headers.insert(k.to_lowercase(), v.to_string());
        }
    }

    let content_length: usize = headers
        .get("content-length")
        .and_then(|v| v.parse().ok())
        .unwrap_or(0);

    let mut body = vec![0u8; content_length];
    if content_length > 0 {
        reader.read_exact(&mut body).ok()?;
    }

    Some(Request { method, path, headers, body })
}

fn send_response(stream: &mut TcpStream, status: u16, status_text: &str, content_type: &str, body: &[u8]) {
    let header = format!(
        "HTTP/1.1 {status} {status_text}\r\n\
         Content-Type: {content_type}\r\n\
         Content-Length: {}\r\n\
         Cache-Control: no-store, must-revalidate\r\n\
         Connection: close\r\n\
         \r\n",
        body.len()
    );
    let _ = stream.write_all(header.as_bytes());
    let _ = stream.write_all(body);
}

// ── Multipart parser ─────────────────────────────────────────────────────────

const MAX_BODY: usize = 32 * 1024 * 1024; // 32 MiB

struct MultipartField {
    name: String,
    filename: Option<String>,
    data: Vec<u8>,
}

/// Parse a multipart/form-data body.  Returns fields or an error string.
fn parse_multipart(body: &[u8], boundary: &str) -> Result<Vec<MultipartField>, String> {
    let delim = format!("--{}", boundary);
    let delim_bytes = delim.as_bytes();

    let mut fields = Vec::new();
    let mut pos = 0;

    // Skip preamble to first boundary.
    while pos < body.len() {
        if body[pos..].starts_with(delim_bytes) {
            pos += delim_bytes.len();
            // Skip CRLF after boundary.
            if body.get(pos) == Some(&b'\r') { pos += 1; }
            if body.get(pos) == Some(&b'\n') { pos += 1; }
            break;
        }
        pos += 1;
    }

    loop {
        // Check for end delimiter (--boundary--).
        let end_delim = format!("--{}--", boundary);
        if pos >= body.len() || body[pos..].starts_with(end_delim.as_bytes()) {
            break;
        }
        // Also handle case where we are right after a boundary and need to check for '--'.
        if pos + 1 < body.len() && &body[pos..pos+2] == b"--" {
            break;
        }

        // Parse headers for this part.
        let mut name = String::new();
        let mut filename: Option<String> = None;

        loop {
            let line_end = body[pos..]
                .windows(2)
                .position(|w| w == b"\r\n")
                .map(|i| pos + i);
            match line_end {
                None => return Err("truncated multipart headers".into()),
                Some(end) => {
                    let line = std::str::from_utf8(&body[pos..end])
                        .map_err(|e| e.to_string())?;
                    pos = end + 2; // skip CRLF
                    if line.is_empty() {
                        break; // blank line = end of headers
                    }
                    if line.to_lowercase().starts_with("content-disposition:") {
                        for part in line.splitn(2, ':').nth(1).unwrap_or("").split(';') {
                            let p = part.trim();
                            if let Some(v) = p.strip_prefix("name=\"").and_then(|s| s.strip_suffix('"')) {
                                name = v.to_string();
                            } else if let Some(v) = p.strip_prefix("filename=\"").and_then(|s| s.strip_suffix('"')) {
                                filename = Some(v.to_string());
                            }
                        }
                    }
                }
            }
        }

        // Find next boundary (CRLF + --boundary).
        let boundary_seq = format!("\r\n--{}", boundary);
        let bnd = boundary_seq.as_bytes();
        let data_end = body[pos..]
            .windows(bnd.len())
            .position(|w| w == bnd)
            .map(|i| pos + i);

        let data = match data_end {
            Some(end) => {
                let d = body[pos..end].to_vec();
                pos = end + bnd.len();
                // Skip CRLF or '--' that follows the boundary marker.
                if pos + 1 < body.len() && &body[pos..pos+2] == b"\r\n" {
                    pos += 2;
                }
                // If '--', the end delimiter follows; the outer loop will break.
                d
            }
            None => {
                // Last part, consume remainder.
                let d = body[pos..].to_vec();
                pos = body.len();
                d
            }
        };

        if !name.is_empty() {
            fields.push(MultipartField { name, filename, data });
        }
    }

    Ok(fields)
}

/// Write uploaded file bytes to a temp path and return the absolute path string.
fn save_upload(basename: &str, data: &[u8]) -> Result<String, String> {
    let id = random_hex_id();
    // Sanitize basename.
    let safe: String = basename
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '.' || c == '-' || c == '_' { c } else { '_' })
        .collect();
    let tmp_dir = std::env::temp_dir().join("surface-uploads");
    fs::create_dir_all(&tmp_dir).map_err(|e| format!("mkdir surface-uploads: {e}"))?;
    let path = tmp_dir.join(format!("{}-{}", id, safe));
    fs::write(&path, data).map_err(|e| format!("write upload: {e}"))?;
    Ok(path.to_string_lossy().into_owned())
}

// ── Request handlers ─────────────────────────────────────────────────────────

/// Shared server state, safe to pass across threads.
struct ServerCtx {
    html_path: PathBuf,
    state_path: PathBuf,
    mu: Mutex<()>,
}

fn handle_get_root(ctx: &ServerCtx, stream: &mut TcpStream) {
    match fs::read(&ctx.html_path) {
        Ok(bytes) => send_response(stream, 200, "OK", "text/html; charset=utf-8", &bytes),
        Err(e) => {
            let msg = format!("cannot read HTML: {e}");
            send_response(stream, 500, "Internal Server Error", "text/plain", msg.as_bytes());
        }
    }
}

/// Handle POST /submit — JSON variant.
fn handle_submit_json(ctx: &ServerCtx, stream: &mut TcpStream, body: &[u8]) {
    let body_str = match std::str::from_utf8(body) {
        Ok(s) => s,
        Err(_) => {
            send_response(stream, 400, "Bad Request", "text/plain", b"body is not valid UTF-8");
            return;
        }
    };

    let mut p = Parser::new(body_str);
    let mut id = String::new();
    let mut payload = String::from("null");

    if let Err(e) = p.expect(b'{') {
        send_response(stream, 400, "Bad Request", "text/plain", format!("bad JSON: {e}").as_bytes());
        return;
    }
    loop {
        p.skip_ws();
        if p.peek() == Some(b'}') {
            p.advance();
            break;
        }
        let key = match p.parse_string() {
            Ok(k) => k,
            Err(e) => {
                send_response(stream, 400, "Bad Request", "text/plain", format!("bad JSON key: {e}").as_bytes());
                return;
            }
        };
        if let Err(e) = p.expect(b':') {
            send_response(stream, 400, "Bad Request", "text/plain", format!("bad JSON: {e}").as_bytes());
            return;
        }
        match key.as_str() {
            "id" => match p.parse_string() {
                Ok(v) => id = v,
                Err(e) => {
                    send_response(stream, 400, "Bad Request", "text/plain", format!("bad id: {e}").as_bytes());
                    return;
                }
            },
            "payload" => match p.parse_value_raw() {
                Ok(v) => payload = v,
                Err(e) => {
                    send_response(stream, 400, "Bad Request", "text/plain", format!("bad payload: {e}").as_bytes());
                    return;
                }
            },
            _ => {
                if let Err(e) = p.parse_value_raw() {
                    send_response(stream, 400, "Bad Request", "text/plain", format!("bad JSON value: {e}").as_bytes());
                    return;
                }
            }
        }
        p.skip_ws();
        if p.peek() == Some(b',') {
            p.advance();
        }
    }

    if id.is_empty() {
        send_response(stream, 400, "Bad Request", "text/plain", b"missing 'id' field");
        return;
    }

    let at = rfc3339_now();
    if let Err(e) = append_submission(&ctx.state_path, &ctx.mu, &id, &payload, &at) {
        send_response(stream, 500, "Internal Server Error", "text/plain", format!("state write: {e}").as_bytes());
        return;
    }

    // Emit SUBMIT line — single-line JSON payload per wire contract.
    println!("SUBMIT {} {}", id, payload);

    send_response(stream, 200, "OK", "text/plain", b"");
}

/// Handle POST /submit — multipart variant.
fn handle_submit_multipart(ctx: &ServerCtx, stream: &mut TcpStream, body: &[u8], boundary: &str) {
    let fields = match parse_multipart(body, boundary) {
        Ok(f) => f,
        Err(e) => {
            send_response(stream, 400, "Bad Request", "text/plain", format!("multipart parse: {e}").as_bytes());
            return;
        }
    };

    let mut id = String::new();
    let mut file_paths: Vec<String> = Vec::new();
    let mut other: Vec<(String, String)> = Vec::new();

    for field in &fields {
        if field.name == "id" && field.filename.is_none() {
            id = String::from_utf8_lossy(&field.data).trim().to_string();
        } else if field.filename.is_some() {
            let fname = field.filename.as_deref().unwrap_or("upload");
            match save_upload(fname, &field.data) {
                Ok(path) => file_paths.push(path),
                Err(e) => {
                    send_response(stream, 500, "Internal Server Error", "text/plain", format!("save upload: {e}").as_bytes());
                    return;
                }
            }
        } else {
            let val = String::from_utf8_lossy(&field.data).into_owned();
            other.push((field.name.clone(), val));
        }
    }

    if id.is_empty() {
        send_response(stream, 400, "Bad Request", "text/plain", b"missing 'id' field in multipart");
        return;
    }

    // Build payload: { "files": [...], "<other>": "..." }
    let mut payload = String::from("{\"files\":[");
    for (i, path) in file_paths.iter().enumerate() {
        payload.push('"');
        payload.push_str(&json_escape(path));
        payload.push('"');
        if i + 1 < file_paths.len() {
            payload.push(',');
        }
    }
    payload.push(']');
    for (k, v) in &other {
        payload.push_str(", \"");
        payload.push_str(&json_escape(k));
        payload.push_str("\": \"");
        payload.push_str(&json_escape(v));
        payload.push('"');
    }
    payload.push('}');

    let at = rfc3339_now();
    if let Err(e) = append_submission(&ctx.state_path, &ctx.mu, &id, &payload, &at) {
        send_response(stream, 500, "Internal Server Error", "text/plain", format!("state write: {e}").as_bytes());
        return;
    }

    println!("SUBMIT {} {}", id, payload);

    send_response(stream, 200, "OK", "text/plain", b"");
}

fn handle_connection(stream: TcpStream, ctx: Arc<ServerCtx>) {
    let mut stream = stream;
    let req = match read_request(&mut stream) {
        Some(r) => r,
        None => return,
    };

    match (req.method.as_str(), req.path.as_str()) {
        ("GET", "/") => {
            handle_get_root(&ctx, &mut stream);
        }
        ("POST", "/submit") => {
            let ct = req.headers.get("content-type").cloned().unwrap_or_default();
            if ct.starts_with("application/json") {
                if req.body.len() > MAX_BODY {
                    send_response(&mut stream, 413, "Payload Too Large", "text/plain", b"body exceeds 32 MiB");
                    return;
                }
                handle_submit_json(&ctx, &mut stream, &req.body);
            } else if ct.starts_with("multipart/form-data") {
                if req.body.len() > MAX_BODY {
                    send_response(&mut stream, 413, "Payload Too Large", "text/plain", b"body exceeds 32 MiB");
                    return;
                }
                let boundary = ct
                    .split(';')
                    .find_map(|p| {
                        p.trim()
                            .strip_prefix("boundary=")
                            .map(|b| b.trim_matches('"').to_string())
                    });
                match boundary {
                    Some(b) => handle_submit_multipart(&ctx, &mut stream, &req.body, &b),
                    None => send_response(
                        &mut stream,
                        400,
                        "Bad Request",
                        "text/plain",
                        b"missing boundary in Content-Type",
                    ),
                }
            } else {
                send_response(
                    &mut stream,
                    415,
                    "Unsupported Media Type",
                    "text/plain",
                    b"content-type must be application/json or multipart/form-data",
                );
            }
        }
        _ => {
            send_response(&mut stream, 404, "Not Found", "text/plain", b"not found");
        }
    }
}

// ── CLI + main ───────────────────────────────────────────────────────────────

struct Config {
    state_path: PathBuf,
    html_path: PathBuf,
    port: u16,
}

fn parse_args() -> Result<Config, String> {
    let args: Vec<String> = env::args().collect();
    let mut state_path = None;
    let mut html_path = None;
    let mut port = None;
    let mut i = 1;
    while i < args.len() {
        match args[i].as_str() {
            "--state" => {
                i += 1;
                state_path = Some(PathBuf::from(args.get(i).ok_or("--state needs a value")?));
            }
            "--html" => {
                i += 1;
                html_path = Some(PathBuf::from(args.get(i).ok_or("--html needs a value")?));
            }
            "--port" => {
                i += 1;
                let v = args.get(i).ok_or("--port needs a value")?;
                port = Some(v.parse::<u16>().map_err(|e| format!("invalid port: {e}"))?);
            }
            other => return Err(format!("unknown argument: {other}")),
        }
        i += 1;
    }
    Ok(Config {
        state_path: state_path.ok_or("--state required")?,
        html_path: html_path.ok_or("--html required")?,
        port: port.ok_or("--port required")?,
    })
}

fn main() {
    let cfg = match parse_args() {
        Ok(c) => c,
        Err(e) => {
            eprintln!("usage error: {e}");
            eprintln!("usage: surface-server --state <path> --html <path> --port <port>");
            std::process::exit(1);
        }
    };

    let ctx = Arc::new(ServerCtx {
        html_path: cfg.html_path,
        state_path: cfg.state_path,
        mu: Mutex::new(()),
    });

    let addr = format!("127.0.0.1:{}", cfg.port);
    let listener = match TcpListener::bind(&addr) {
        Ok(l) => l,
        Err(e) => {
            eprintln!("cannot bind {addr}: {e}");
            std::process::exit(1);
        }
    };

    eprintln!("surface-server listening on http://{addr}/");

    for stream_result in listener.incoming() {
        match stream_result {
            Ok(stream) => {
                let ctx = Arc::clone(&ctx);
                std::thread::spawn(move || handle_connection(stream, ctx));
            }
            Err(e) => {
                eprintln!("accept error: {e}");
            }
        }
    }
}

// ── Integration tests ────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        net::{TcpListener, TcpStream},
        sync::{Arc, Mutex},
        time::Duration,
    };

    /// Spin up the server on an ephemeral OS-assigned port, return (port, ctx).
    fn start_test_server(state_path: &str, html_path: &str) -> (u16, Arc<ServerCtx>) {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind ephemeral");
        let port = listener.local_addr().unwrap().port();

        let ctx = Arc::new(ServerCtx {
            html_path: PathBuf::from(html_path),
            state_path: PathBuf::from(state_path),
            mu: Mutex::new(()),
        });

        let ctx_clone = Arc::clone(&ctx);
        std::thread::spawn(move || {
            for stream in listener.incoming() {
                match stream {
                    Ok(s) => {
                        let c = Arc::clone(&ctx_clone);
                        std::thread::spawn(move || handle_connection(s, c));
                    }
                    Err(_) => break,
                }
            }
        });

        // Give the thread a moment to be ready.
        std::thread::sleep(Duration::from_millis(20));
        (port, ctx)
    }

    /// Make a raw HTTP request and return (status_line, body).
    fn http_raw(port: u16, req: &str) -> (String, Vec<u8>) {
        let mut stream = TcpStream::connect(format!("127.0.0.1:{port}")).expect("connect");
        stream.set_read_timeout(Some(Duration::from_secs(5))).unwrap();
        stream.write_all(req.as_bytes()).expect("write");

        let mut resp = Vec::new();
        let _ = stream.read_to_end(&mut resp);
        let resp_str = String::from_utf8_lossy(&resp);

        // Split status line from body.
        let status_line = resp_str.lines().next().unwrap_or("").to_string();
        let body_start = resp.windows(4).position(|w| w == b"\r\n\r\n").map(|i| i + 4).unwrap_or(resp.len());
        let body = resp[body_start..].to_vec();
        (status_line, body)
    }

    fn write_state(path: &str, json: &str) {
        fs::write(path, json).expect("write state file");
    }

    fn write_html(path: &str, html: &str) {
        fs::write(path, html).expect("write html file");
    }

    // ── Tests ─────────────────────────────────────────────────────────────────

    /// GET / returns the agent-authored HTML.
    #[test]
    fn test_get_root_serves_html() {
        let tmpdir = std::env::temp_dir().join(format!("surf-test-{}", random_hex_id()));
        fs::create_dir_all(&tmpdir).unwrap();
        let state_path = tmpdir.join("state.json").to_string_lossy().into_owned();
        let html_path = tmpdir.join("page.html").to_string_lossy().into_owned();

        let html_content = "<html><body>hello surface</body></html>";
        write_html(&html_path, html_content);
        write_state(&state_path, r#"{"session_id":"s1","affordances":{},"submissions":[]}"#);

        let (port, _ctx) = start_test_server(&state_path, &html_path);

        let req = format!("GET / HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n");
        let (status, body) = http_raw(port, &req);

        assert!(status.contains("200"), "status: {status}");
        assert_eq!(String::from_utf8_lossy(&body), html_content);
    }

    /// POST /submit with application/json: appends to state file and emits SUBMIT line format.
    #[test]
    fn test_submit_json_wire_envelope() {
        let tmpdir = std::env::temp_dir().join(format!("surf-test-{}", random_hex_id()));
        fs::create_dir_all(&tmpdir).unwrap();
        let state_path = tmpdir.join("state.json").to_string_lossy().into_owned();
        let html_path = tmpdir.join("page.html").to_string_lossy().into_owned();

        write_html(&html_path, "<html></html>");
        // Affordance a1b2c3 maps to an intent.
        write_state(
            &state_path,
            r#"{
              "session_id": "s_wire_test",
              "affordances": {
                "a1b2c3": {"label": "Confirm", "intent": "confirm_op_42"}
              },
              "submissions": []
            }"#,
        );

        let (port, _ctx) = start_test_server(&state_path, &html_path);

        let body_json = r#"{"id":"a1b2c3","payload":{"action":"confirm"}}"#;
        let req = format!(
            "POST /submit HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body_json}",
            body_json.len()
        );
        let (status, _body) = http_raw(port, &req);
        assert!(status.contains("200"), "status: {status}");

        // Verify state file was updated.
        let raw = fs::read_to_string(&state_path).expect("read state");
        let state = parse_state(&raw).expect("parse state");

        assert_eq!(state.submissions.len(), 1, "should have one submission");
        let sub = &state.submissions[0];
        assert_eq!(sub.id, "a1b2c3");
        // Payload should contain the JSON object.
        assert!(sub.payload.contains("confirm"), "payload: {}", sub.payload);
        // Timestamp should be RFC3339 (starts with 20xx).
        assert!(sub.at.starts_with("20"), "at: {}", sub.at);
        assert!(sub.at.ends_with('Z'), "at should end with Z: {}", sub.at);
    }

    /// POST /submit with null payload normalizes to JSON null.
    #[test]
    fn test_submit_null_payload() {
        let tmpdir = std::env::temp_dir().join(format!("surf-test-{}", random_hex_id()));
        fs::create_dir_all(&tmpdir).unwrap();
        let state_path = tmpdir.join("state.json").to_string_lossy().into_owned();
        let html_path = tmpdir.join("page.html").to_string_lossy().into_owned();

        write_html(&html_path, "<html></html>");
        write_state(
            &state_path,
            r#"{"session_id":"sn","affordances":{"btn1":{"label":"Ok","intent":"ok"}},"submissions":[]}"#,
        );

        let (port, _ctx) = start_test_server(&state_path, &html_path);

        // Send {"id":"btn1","payload":null}
        let body_json = r#"{"id":"btn1","payload":null}"#;
        let req = format!(
            "POST /submit HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body_json}",
            body_json.len()
        );
        let (status, _) = http_raw(port, &req);
        assert!(status.contains("200"), "status: {status}");

        let raw = fs::read_to_string(&state_path).unwrap();
        let state = parse_state(&raw).unwrap();
        assert_eq!(state.submissions[0].payload, "null");
    }

    /// POST /submit with missing payload field normalizes to JSON null.
    #[test]
    fn test_submit_missing_payload_normalizes_to_null() {
        let tmpdir = std::env::temp_dir().join(format!("surf-test-{}", random_hex_id()));
        fs::create_dir_all(&tmpdir).unwrap();
        let state_path = tmpdir.join("state.json").to_string_lossy().into_owned();
        let html_path = tmpdir.join("page.html").to_string_lossy().into_owned();

        write_html(&html_path, "<html></html>");
        write_state(
            &state_path,
            r#"{"session_id":"sm","affordances":{"btn2":{"label":"Go","intent":"go"}},"submissions":[]}"#,
        );

        let (port, _ctx) = start_test_server(&state_path, &html_path);

        // Omit payload field entirely.
        let body_json = r#"{"id":"btn2"}"#;
        let req = format!(
            "POST /submit HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body_json}",
            body_json.len()
        );
        let (status, _) = http_raw(port, &req);
        assert!(status.contains("200"), "status: {status}");

        let raw = fs::read_to_string(&state_path).unwrap();
        let state = parse_state(&raw).unwrap();
        assert_eq!(state.submissions[0].payload, "null", "missing payload should normalize to null");
    }

    /// POST /submit with unsupported content-type returns 415.
    #[test]
    fn test_unsupported_content_type_returns_415() {
        let tmpdir = std::env::temp_dir().join(format!("surf-test-{}", random_hex_id()));
        fs::create_dir_all(&tmpdir).unwrap();
        let state_path = tmpdir.join("state.json").to_string_lossy().into_owned();
        let html_path = tmpdir.join("page.html").to_string_lossy().into_owned();

        write_html(&html_path, "<html></html>");
        write_state(
            &state_path,
            r#"{"session_id":"su","affordances":{},"submissions":[]}"#,
        );

        let (port, _ctx) = start_test_server(&state_path, &html_path);

        // application/x-www-form-urlencoded — should be rejected per wire-example.md.
        let body = b"id=abc&payload=foo";
        let req = format!(
            "POST /submit HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nContent-Type: application/x-www-form-urlencoded\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
            body.len()
        );
        let (status, _) = http_raw(port, &(req + &String::from_utf8_lossy(body)));
        assert!(status.contains("415"), "expected 415 for urlencoded, got: {status}");
    }

    /// POST /submit with multipart: payload has files array + other fields.
    #[test]
    fn test_submit_multipart_wire_envelope() {
        let tmpdir = std::env::temp_dir().join(format!("surf-test-{}", random_hex_id()));
        fs::create_dir_all(&tmpdir).unwrap();
        let state_path = tmpdir.join("state.json").to_string_lossy().into_owned();
        let html_path = tmpdir.join("page.html").to_string_lossy().into_owned();

        write_html(&html_path, "<html></html>");
        write_state(
            &state_path,
            r#"{"session_id":"smulti","affordances":{"up1":{"label":"Upload","intent":"upload_receipt"}},"submissions":[]}"#,
        );

        let (port, _ctx) = start_test_server(&state_path, &html_path);

        let boundary = "testboundary1234";
        let file_content = b"fake image bytes";
        let multipart_body = format!(
            "--{boundary}\r\n\
             Content-Disposition: form-data; name=\"id\"\r\n\r\n\
             up1\r\n\
             --{boundary}\r\n\
             Content-Disposition: form-data; name=\"file\"; filename=\"receipt.png\"\r\n\
             Content-Type: image/png\r\n\r\n\
             {}\r\n\
             --{boundary}--\r\n",
            String::from_utf8_lossy(file_content)
        );
        let req = format!(
            "POST /submit HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nContent-Type: multipart/form-data; boundary={boundary}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{multipart_body}",
            multipart_body.len()
        );
        let (status, _) = http_raw(port, &req);
        assert!(status.contains("200"), "status: {status}");

        let raw = fs::read_to_string(&state_path).unwrap();
        let state = parse_state(&raw).unwrap();
        assert_eq!(state.submissions.len(), 1);
        let sub = &state.submissions[0];
        assert_eq!(sub.id, "up1");
        // payload must contain "files" array (the wire envelope requires it).
        assert!(sub.payload.contains("\"files\""), "multipart payload must have files key: {}", sub.payload);
        // The uploaded file should have been saved and its path included.
        assert!(sub.payload.contains("receipt.png") || sub.payload.contains("surface-uploads"),
                "payload should reference the saved file path: {}", sub.payload);
    }

    /// State schema round-trips correctly: parse → serialize → re-parse.
    #[test]
    fn test_state_schema_round_trip() {
        let json = r#"{
  "session_id": "s_7f3a9c",
  "affordances": {
    "a1b2c3": {"label": "Confirm", "intent": "confirm_destructive_op_42"}
  },
  "submissions": [
    {"id": "a1b2c3", "payload": null, "at": "2026-05-16T19:45:12.341827Z"}
  ]
}"#;
        let state = parse_state(json).expect("parse");
        assert_eq!(state.session_id, "s_7f3a9c");
        assert!(state.affordances.contains_key("a1b2c3"));
        assert_eq!(state.affordances["a1b2c3"].label, "Confirm");
        assert_eq!(state.submissions.len(), 1);
        assert_eq!(state.submissions[0].id, "a1b2c3");
        assert_eq!(state.submissions[0].payload, "null");

        // Re-serialize and re-parse.
        let out = state_to_json(&state);
        let state2 = parse_state(&out).expect("re-parse");
        assert_eq!(state2.session_id, state.session_id);
        assert_eq!(state2.submissions.len(), 1);
        assert_eq!(state2.submissions[0].payload, "null");
    }

    /// Multiple submissions append correctly (append-only log property).
    #[test]
    fn test_multiple_submissions_append_only() {
        let tmpdir = std::env::temp_dir().join(format!("surf-test-{}", random_hex_id()));
        fs::create_dir_all(&tmpdir).unwrap();
        let state_path = tmpdir.join("state.json").to_string_lossy().into_owned();
        let html_path = tmpdir.join("page.html").to_string_lossy().into_owned();

        write_html(&html_path, "<html></html>");
        write_state(
            &state_path,
            r#"{"session_id":"smulti2","affordances":{"a":{"label":"A","intent":"pick_a"},"b":{"label":"B","intent":"pick_b"}},"submissions":[]}"#,
        );

        let (port, _ctx) = start_test_server(&state_path, &html_path);

        for (id, payload) in [("a", r#"{"choice":"a"}"#), ("b", "null")] {
            let body_json = format!(r#"{{"id":"{id}","payload":{payload}}}"#);
            let req = format!(
                "POST /submit HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body_json}",
                body_json.len()
            );
            let (status, _) = http_raw(port, &req);
            assert!(status.contains("200"), "status: {status}");
            // Allow threads a moment to complete.
            std::thread::sleep(Duration::from_millis(10));
        }

        let raw = fs::read_to_string(&state_path).unwrap();
        let state = parse_state(&raw).unwrap();
        assert_eq!(state.submissions.len(), 2, "should have 2 submissions appended");
        assert_eq!(state.submissions[0].id, "a");
        assert_eq!(state.submissions[1].id, "b");
    }

    /// RFC3339 timestamp format check.
    #[test]
    fn test_rfc3339_now_format() {
        let ts = rfc3339_now();
        // Must match: YYYY-MM-DDTHH:MM:SS.xxxxxxZ
        assert_eq!(ts.len(), 27, "timestamp len: {ts}");
        assert!(ts.starts_with("20"), "starts with year: {ts}");
        assert!(ts.ends_with('Z'), "ends with Z: {ts}");
        assert_eq!(&ts[4..5], "-");
        assert_eq!(&ts[7..8], "-");
        assert_eq!(&ts[10..11], "T");
        assert_eq!(&ts[19..20], ".");
    }

    /// Unknown routes return 404.
    #[test]
    fn test_unknown_route_404() {
        let tmpdir = std::env::temp_dir().join(format!("surf-test-{}", random_hex_id()));
        fs::create_dir_all(&tmpdir).unwrap();
        let state_path = tmpdir.join("state.json").to_string_lossy().into_owned();
        let html_path = tmpdir.join("page.html").to_string_lossy().into_owned();

        write_html(&html_path, "<html></html>");
        write_state(&state_path, r#"{"session_id":"s404","affordances":{},"submissions":[]}"#);

        let (port, _ctx) = start_test_server(&state_path, &html_path);

        let req = format!("GET /does-not-exist HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n");
        let (status, _) = http_raw(port, &req);
        assert!(status.contains("404"), "expected 404, got: {status}");
    }
}
