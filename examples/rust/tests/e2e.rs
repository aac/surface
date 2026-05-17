// End-to-end tests: spawn the compiled binary, exercise the HTTP surface, verify
// SUBMIT stdout lines and state-file effects.
//
// Lives in tests/ rather than as #[cfg(test)] inside main.rs so the integration-test
// CARGO_BIN_EXE_<name> env var is available for locating the built binary.

use std::fs;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::mpsc::Receiver;
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde_json::{json, Value};

fn tempdir() -> PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "poke-rust-e2e-{}-{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    fs::create_dir_all(&dir).unwrap();
    dir
}

fn write_initial_state(dir: &Path) -> PathBuf {
    let path = dir.join("state.json");
    let body = json!({
        "session_id": "s_test",
        "affordances": {
            "abc123": { "label": "Approve", "intent": "approve_pr_42" },
            "def456": { "label": "Upload",  "intent": "upload_receipt" }
        },
        "submissions": []
    });
    fs::write(&path, serde_json::to_vec_pretty(&body).unwrap()).unwrap();
    path
}

fn write_html(dir: &Path) -> PathBuf {
    let path = dir.join("page.html");
    fs::write(&path, b"<!doctype html><html><body>hi</body></html>").unwrap();
    path
}

fn free_port() -> u16 {
    let l = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let p = l.local_addr().unwrap().port();
    drop(l);
    p
}

struct ServerHandle {
    child: Child,
    stdout_lines: Receiver<String>,
}

impl Drop for ServerHandle {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

fn spawn_server(state: &Path, html: &Path, port: u16, drain: &str) -> ServerHandle {
    let bin = env!("CARGO_BIN_EXE_poke-rust-server");
    let mut child = Command::new(bin)
        .args([
            "--state",
            state.to_str().unwrap(),
            "--html",
            html.to_str().unwrap(),
            "--port",
            &port.to_string(),
            "--drain-mode",
            drain,
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("spawn server");

    let stdout = child.stdout.take().unwrap();
    let (tx, rx) = std::sync::mpsc::channel::<String>();
    thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines().flatten() {
            let _ = tx.send(line);
        }
    });

    let deadline = Instant::now() + Duration::from_secs(3);
    loop {
        if TcpStream::connect(("127.0.0.1", port)).is_ok() {
            break;
        }
        if Instant::now() > deadline {
            panic!("server failed to come up on port {}", port);
        }
        thread::sleep(Duration::from_millis(50));
    }

    ServerHandle {
        child,
        stdout_lines: rx,
    }
}

fn http_request(port: u16, request: &str) -> (u16, String) {
    let mut s = TcpStream::connect(("127.0.0.1", port)).unwrap();
    s.write_all(request.as_bytes()).unwrap();
    s.set_read_timeout(Some(Duration::from_secs(3))).unwrap();
    let mut buf = Vec::new();
    s.read_to_end(&mut buf).unwrap();
    let text = String::from_utf8_lossy(&buf).to_string();
    let mut parts = text.splitn(2, "\r\n\r\n");
    let head = parts.next().unwrap_or("").to_string();
    let body = parts.next().unwrap_or("").to_string();
    let status = head
        .lines()
        .next()
        .and_then(|l| l.split_whitespace().nth(1))
        .and_then(|s| s.parse::<u16>().ok())
        .unwrap_or(0);
    (status, body)
}

fn wait_for_line<F: Fn(&str) -> bool>(
    handle: &ServerHandle,
    pred: F,
    timeout: Duration,
) -> Option<String> {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        if let Ok(line) = handle.stdout_lines.recv_timeout(Duration::from_millis(200)) {
            if pred(&line) {
                return Some(line);
            }
        }
    }
    None
}

#[test]
fn e2e_get_root_serves_html_with_no_store() {
    let dir = tempdir();
    let state = write_initial_state(&dir);
    let html = write_html(&dir);
    let port = free_port();
    let _h = spawn_server(&state, &html, port, "stdout");
    let mut s = TcpStream::connect(("127.0.0.1", port)).unwrap();
    s.write_all(b"GET / HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n")
        .unwrap();
    s.set_read_timeout(Some(Duration::from_secs(3))).unwrap();
    let mut buf = Vec::new();
    s.read_to_end(&mut buf).unwrap();
    let text = String::from_utf8_lossy(&buf);
    assert!(text.starts_with("HTTP/1.1 200"), "got: {}", text);
    let head_lower = text.to_lowercase();
    assert!(head_lower.contains("cache-control"));
    assert!(head_lower.contains("no-store"));
    assert!(text.contains("<body>hi</body>"));
}

#[test]
fn e2e_post_submit_json_emits_stdout_and_appends_state() {
    let dir = tempdir();
    let state = write_initial_state(&dir);
    let html = write_html(&dir);
    let port = free_port();
    let h = spawn_server(&state, &html, port, "stdout");

    let body = r#"{"id":"abc123","payload":{"ok":true}}"#;
    let req = format!(
        "POST /submit HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{}",
        body.len(),
        body
    );
    let (status, _) = http_request(port, &req);
    assert_eq!(status, 200);

    let line = wait_for_line(&h, |l| l.starts_with("SUBMIT "), Duration::from_secs(3))
        .expect("SUBMIT line");
    let mut parts = line.splitn(3, ' ');
    assert_eq!(parts.next(), Some("SUBMIT"));
    assert_eq!(parts.next(), Some("abc123"));
    let payload: Value = serde_json::from_str(parts.next().unwrap()).unwrap();
    assert_eq!(payload["ok"], true);

    let on_disk: Value = serde_json::from_slice(&fs::read(&state).unwrap()).unwrap();
    let subs = on_disk["submissions"].as_array().unwrap();
    assert_eq!(subs.len(), 1);
    assert_eq!(subs[0]["id"], "abc123");
}

#[test]
fn e2e_post_submit_rejects_form_urlencoded() {
    let dir = tempdir();
    let state = write_initial_state(&dir);
    let html = write_html(&dir);
    let port = free_port();
    let _h = spawn_server(&state, &html, port, "stdout");

    let body = "id=abc123&payload=null";
    let req = format!(
        "POST /submit HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\nContent-Type: application/x-www-form-urlencoded\r\nContent-Length: {}\r\n\r\n{}",
        body.len(),
        body
    );
    let (status, _) = http_request(port, &req);
    assert!((400..500).contains(&status), "got status {}", status);
}

#[test]
fn e2e_post_submit_rejects_bad_json() {
    let dir = tempdir();
    let state = write_initial_state(&dir);
    let html = write_html(&dir);
    let port = free_port();
    let _h = spawn_server(&state, &html, port, "stdout");

    let body = "{not json";
    let req = format!(
        "POST /submit HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{}",
        body.len(),
        body
    );
    let (status, _) = http_request(port, &req);
    assert_eq!(status, 400);
}

#[test]
fn e2e_multipart_upload_writes_file_and_emits_path() {
    let dir = tempdir();
    let state = write_initial_state(&dir);
    let html = write_html(&dir);
    let port = free_port();
    let h = spawn_server(&state, &html, port, "stdout");

    let boundary = "----poketest123";
    let body = format!(
        "--{b}\r\nContent-Disposition: form-data; name=\"id\"\r\n\r\ndef456\r\n--{b}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"hello.txt\"\r\nContent-Type: text/plain\r\n\r\nhello rust\r\n--{b}--\r\n",
        b = boundary
    );
    let req = format!(
        "POST /submit HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\nContent-Type: multipart/form-data; boundary={}\r\nContent-Length: {}\r\n\r\n{}",
        boundary,
        body.len(),
        body
    );
    let (status, _) = http_request(port, &req);
    assert_eq!(status, 200);

    let line = wait_for_line(&h, |l| l.starts_with("SUBMIT "), Duration::from_secs(3))
        .expect("SUBMIT line");
    let mut parts = line.splitn(3, ' ');
    assert_eq!(parts.next(), Some("SUBMIT"));
    assert_eq!(parts.next(), Some("def456"));
    let payload: Value = serde_json::from_str(parts.next().unwrap()).unwrap();
    let files = payload["files"].as_array().expect("files array");
    assert_eq!(files.len(), 1);
    let path = files[0].as_str().unwrap();
    let content = fs::read_to_string(path).unwrap();
    assert_eq!(content, "hello rust");
}

#[test]
fn e2e_fs_drain_mode_writes_submission_file() {
    let dir = tempdir();
    let state = write_initial_state(&dir);
    let html = write_html(&dir);
    let port = free_port();
    let _h = spawn_server(&state, &html, port, "fs");

    let body = r#"{"id":"abc123","payload":42}"#;
    let req = format!(
        "POST /submit HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{}",
        body.len(),
        body
    );
    let (status, _) = http_request(port, &req);
    assert_eq!(status, 200);

    let drop_dir = dir.join("submissions");
    let deadline = Instant::now() + Duration::from_secs(3);
    let mut found: Option<PathBuf> = None;
    while Instant::now() < deadline {
        if let Ok(rd) = fs::read_dir(&drop_dir) {
            let entries: Vec<_> = rd.flatten().collect();
            if let Some(e) = entries.first() {
                found = Some(e.path());
                break;
            }
        }
        thread::sleep(Duration::from_millis(50));
    }
    let path = found.expect("submission file");
    let on_disk: Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
    assert_eq!(on_disk["id"], "abc123");
    assert_eq!(on_disk["payload"], 42);
    assert!(on_disk.get("at").is_some());
}

#[test]
fn e2e_unknown_route_returns_404() {
    let dir = tempdir();
    let state = write_initial_state(&dir);
    let html = write_html(&dir);
    let port = free_port();
    let _h = spawn_server(&state, &html, port, "stdout");
    let req = "GET /no-such-thing HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n";
    let (status, _) = http_request(port, req);
    assert_eq!(status, 404);
}
