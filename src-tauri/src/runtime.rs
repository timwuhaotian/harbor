use std::{
    fs,
    io::{BufRead, BufReader, Read},
    net::{Ipv4Addr, SocketAddrV4, TcpListener},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::Mutex,
    thread,
    time::Duration,
};

use serde::Serialize;
#[cfg(not(test))]
use tauri::image::Image;
use tauri::{path::BaseDirectory, AppHandle, Emitter, Manager, State};

use crate::config::{
    build_preview, build_sing_box_config, default_settings, default_settings_from_json,
    validate_start_settings, HarborError, HarborSettings, Preview,
};

const BUNDLED_DEFAULTS_RESOURCE: &str = "resources/harbor-defaults.bundle.json";
const BUNDLED_CLOUDFLARED_RESOURCE: &str = "resources/cloudflared";
const BUNDLED_SING_BOX_RESOURCE: &str = "resources/sing-box";

pub fn sing_box_args(config_path: &Path) -> Vec<String> {
    vec![
        "run".to_string(),
        "-c".to_string(),
        config_path.to_string_lossy().to_string(),
    ]
}

pub fn cloudflared_args() -> Vec<String> {
    vec![
        "tunnel".to_string(),
        "--no-autoupdate".to_string(),
        "run".to_string(),
    ]
}

pub fn cloudflared_token_env(token: &str) -> Result<(&'static str, String), HarborError> {
    let token = token.trim();

    if token.is_empty() {
        return Err(HarborError::Validation(
            "Cloudflare tunnel token is required".to_string(),
        ));
    }

    Ok(("TUNNEL_TOKEN", token.to_string()))
}

pub fn config_path(config_dir: &Path) -> PathBuf {
    config_dir.join("sing-box.json")
}

pub fn resolve_runtime_program(app: &AppHandle, program: &str) -> PathBuf {
    let program = program.trim();
    let path = Path::new(program);

    if path.components().count() > 1 {
        return path.to_path_buf();
    }

    let bundled = resolve_bundled_binary(app, program);
    if bundled.exists() {
        return bundled;
    }

    resolve_system_program_with(program, Path::is_file)
}

fn resolve_bundled_binary(app: &AppHandle, program: &str) -> PathBuf {
    let resource_name = if cfg!(windows) {
        if program == "cloudflared" {
            "cloudflared.exe"
        } else if program == "sing-box" {
            "sing-box.exe"
        } else {
            program
        }
    } else {
        program
    };

    let resource = if resource_name == "cloudflared" || resource_name == "cloudflared.exe" {
        BUNDLED_CLOUDFLARED_RESOURCE
    } else if resource_name == "sing-box" || resource_name == "sing-box.exe" {
        BUNDLED_SING_BOX_RESOURCE
    } else {
        return PathBuf::from(program);
    };

    app.path()
        .resolve(resource, BaseDirectory::Resource)
        .unwrap_or_else(|_| PathBuf::from(program))
}

pub fn resolve_system_program_with<F>(program: &str, exists: F) -> PathBuf
where
    F: Fn(&Path) -> bool,
{
    let program = program.trim();
    let path = Path::new(program);

    if path.components().count() > 1 {
        return path.to_path_buf();
    }

    for base in ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"] {
        let candidate = Path::new(base).join(program);

        if exists(&candidate) {
            return candidate;
        }
    }

    PathBuf::from(program)
}

fn runtime_program_or_default(program: &str, default_program: &str) -> String {
    let program = program.trim();

    if program.is_empty() {
        default_program.to_string()
    } else {
        program.to_string()
    }
}

fn check_port_available(port: u16) -> Result<(), HarborError> {
    let addr = SocketAddrV4::new(Ipv4Addr::LOCALHOST, port);
    match TcpListener::bind(addr) {
        Ok(_) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::AddrInUse => {
            let user = find_port_user(port);
            let msg = match user {
                Some((name, pid)) => format!(
                    "Port {} is already in use by {} (PID {}). Stop it first or change the local port.",
                    port, name, pid
                ),
                None => format!(
                    "Port {} is already in use by another process. Change the local port.",
                    port
                ),
            };
            Err(HarborError::Validation(msg))
        }
        Err(e) => Err(HarborError::Validation(format!(
            "Cannot check port {}: {}",
            port, e
        ))),
    }
}

fn find_port_user(port: u16) -> Option<(String, u32)> {
    #[cfg(unix)]
    {
        let output = Command::new("lsof")
            .args(["-i", &format!(":{}", port), "-sTCP:LISTEN", "-P", "-n"])
            .output()
            .ok()?;
        if !output.status.success() {
            return None;
        }
        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines().skip(1) {
            let fields: Vec<&str> = line.split_whitespace().collect();
            if fields.len() >= 2 {
                if let Ok(pid) = fields[1].parse::<u32>() {
                    return Some((fields[0].to_string(), pid));
                }
            }
        }
        None
    }
    #[cfg(not(unix))]
    {
        let _ = port;
        None
    }
}

#[derive(Debug, Default)]
pub struct HarborRuntime {
    sing_box: Option<Child>,
    cloudflared: Option<Child>,
    last_vless_link: Option<String>,
    last_config_path: Option<PathBuf>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HarborStatus {
    pub running: bool,
    pub sing_box_running: bool,
    pub cloudflared_running: bool,
    pub vless_link: Option<String>,
    pub config_path: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HarborLogEvent {
    pub source: String,
    pub stream: String,
    pub line: String,
}

#[tauri::command]
pub fn get_default_settings(app: AppHandle) -> Result<HarborSettings, HarborError> {
    let path = app
        .path()
        .resolve(BUNDLED_DEFAULTS_RESOURCE, BaseDirectory::Resource)
        .map_err(|error| HarborError::Runtime(error.to_string()))?;

    match fs::read_to_string(path) {
        Ok(json) => default_settings_from_json(&json),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(default_settings()),
        Err(error) => Err(error.into()),
    }
}

#[tauri::command]
pub fn preview_settings(settings: HarborSettings) -> Result<Preview, HarborError> {
    build_preview(&settings)
}

#[tauri::command]
pub fn start_harbor(
    app: AppHandle,
    state: State<'_, Mutex<HarborRuntime>>,
    settings: HarborSettings,
) -> Result<HarborStatus, HarborError> {
    validate_start_settings(&settings)?;
    check_port_available(settings.local_port)?;

    let preview = build_preview(&settings)?;
    let app_config_dir = app
        .path()
        .app_config_dir()
        .map_err(|error| HarborError::Runtime(error.to_string()))?;
    fs::create_dir_all(&app_config_dir)?;

    let path = config_path(&app_config_dir);
    let json = serde_json::to_string_pretty(&build_sing_box_config(&settings)?)?;
    fs::write(&path, json)?;

    let mut runtime = lock_runtime(&state)?;
    runtime.refresh();

    if runtime.sing_box.is_some() || runtime.cloudflared.is_some() {
        return Err(HarborError::Runtime(
            "Harbor is already running; stop it before starting again".to_string(),
        ));
    }

    let mut sing_box = spawn_logged_process(
        app.clone(),
        "sing-box",
        &settings.sing_box_path,
        sing_box_args(&path),
        None,
    )?;
    let cloudflared_env = cloudflared_token_env(&settings.cloudflared_token)?;
    let cloudflared = match spawn_logged_process(
        app,
        "cloudflared",
        &settings.cloudflared_path,
        cloudflared_args(),
        Some(cloudflared_env),
    ) {
        Ok(child) => child,
        Err(error) => {
            let _ = sing_box.kill();
            let _ = sing_box.wait();
            return Err(error);
        }
    };

    runtime.sing_box = Some(sing_box);
    runtime.cloudflared = Some(cloudflared);
    runtime.last_vless_link = Some(preview.vless_link);
    runtime.last_config_path = Some(path);

    eprintln!("Harbor: spawned sing-box (pid={}) and cloudflared (pid={})", 
        runtime.sing_box.as_ref().map(|c| c.id()).unwrap_or(0),
        runtime.cloudflared.as_ref().map(|c| c.id()).unwrap_or(0));

    Ok(runtime.status())
}

#[tauri::command]
pub fn stop_harbor(state: State<'_, Mutex<HarborRuntime>>) -> Result<HarborStatus, HarborError> {
    let mut runtime = lock_runtime(&state)?;
    runtime.stop();
    Ok(runtime.status())
}

#[tauri::command]
pub fn get_status(state: State<'_, Mutex<HarborRuntime>>) -> Result<HarborStatus, HarborError> {
    let mut runtime = lock_runtime(&state)?;
    runtime.refresh();
    Ok(runtime.status())
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DependencyStatus {
    pub sing_box_ok: bool,
    pub cloudflared_ok: bool,
    pub sing_box_path: String,
    pub cloudflared_path: String,
    pub sing_box_version: Option<String>,
    pub cloudflared_version: Option<String>,
}

#[tauri::command]
pub fn check_dependencies(
    app: AppHandle,
    settings: HarborSettings,
) -> Result<DependencyStatus, HarborError> {
    let sing_box_program = runtime_program_or_default(&settings.sing_box_path, "sing-box");
    let cloudflared_program = runtime_program_or_default(&settings.cloudflared_path, "cloudflared");
    let sing_box_path = resolve_runtime_program(&app, &sing_box_program);
    let cloudflared_path = resolve_runtime_program(&app, &cloudflared_program);

    let sing_box_ok = sing_box_path.is_file();
    let cloudflared_ok = cloudflared_path.is_file();

    let sing_box_version = if sing_box_ok {
        Command::new(&sing_box_path)
            .arg("version")
            .output()
            .ok()
            .and_then(|o| {
                if o.status.success() {
                    Some(String::from_utf8_lossy(&o.stdout).trim().to_string())
                } else {
                    None
                }
            })
    } else {
        None
    };

    let cloudflared_version = if cloudflared_ok {
        Command::new(&cloudflared_path)
            .arg("version")
            .output()
            .ok()
            .and_then(|o| {
                if o.status.success() {
                    Some(String::from_utf8_lossy(&o.stdout).trim().to_string())
                } else {
                    None
                }
            })
    } else {
        None
    };

    Ok(DependencyStatus {
        sing_box_ok,
        cloudflared_ok,
        sing_box_path: sing_box_path.to_string_lossy().to_string(),
        cloudflared_path: cloudflared_path.to_string_lossy().to_string(),
        sing_box_version,
        cloudflared_version,
    })
}

#[cfg(not(test))]
#[tauri::command]
pub fn update_tray_icon(app: AppHandle, running: bool) -> Result<(), HarborError> {
    let tray_state = app.state::<crate::TrayState>();
    let tray = &tray_state.tray;

    let icon_name = if running {
        "icons/icon-tray-active.png"
    } else {
        "icons/icon-tray.png"
    };

    let path = app
        .path()
        .resolve(icon_name, BaseDirectory::Resource)
        .map_err(|e| HarborError::Runtime(e.to_string()))?;

    let icon = Image::from_path(&path)
        .map_err(|e| HarborError::Runtime(format!("Failed to load tray icon: {}", e)))?;

    let locale = tray_state.locale.lock().unwrap_or_else(|e| e.into_inner()).clone();
    let is_zh = locale == "zh-CN";

    tray
        .set_icon(Some(icon))
        .map_err(|e| HarborError::Runtime(e.to_string()))?;

    tray
        .set_tooltip(Some(if running {
            if is_zh { "Harbor - 服务运行中" } else { "Harbor - Running" }
        } else {
            if is_zh { "Harbor - 已停止" } else { "Harbor - Stopped" }
        }))
        .map_err(|e| HarborError::Runtime(e.to_string()))?;

    Ok(())
}

impl HarborRuntime {
    fn status(&self) -> HarborStatus {
        let sing_box_running = self.sing_box.is_some();
        let cloudflared_running = self.cloudflared.is_some();

        HarborStatus {
            running: sing_box_running && cloudflared_running,
            sing_box_running,
            cloudflared_running,
            vless_link: self.last_vless_link.clone(),
            config_path: self
                .last_config_path
                .as_ref()
                .map(|path| path.to_string_lossy().to_string()),
        }
    }

    fn refresh(&mut self) {
        let sb_before = self.sing_box.is_some();
        let cf_before = self.cloudflared.is_some();
        refresh_child(&mut self.sing_box);
        refresh_child(&mut self.cloudflared);
        let sb_after = self.sing_box.is_some();
        let cf_after = self.cloudflared.is_some();
        if sb_before && !sb_after {
            eprintln!("Harbor: sing-box process exited unexpectedly");
        }
        if cf_before && !cf_after {
            eprintln!("Harbor: cloudflared process exited unexpectedly");
        }
    }

    pub fn stop(&mut self) {
        stop_child(&mut self.cloudflared);
        stop_child(&mut self.sing_box);
    }
}

fn lock_runtime<'a>(
    state: &'a State<'_, Mutex<HarborRuntime>>,
) -> Result<std::sync::MutexGuard<'a, HarborRuntime>, HarborError> {
    state
        .lock()
        .map_err(|_| HarborError::Runtime("Harbor runtime lock was poisoned".to_string()))
}

fn spawn_logged_process(
    app: AppHandle,
    source: &'static str,
    program: &str,
    args: Vec<String>,
    env: Option<(&str, String)>,
) -> Result<Child, HarborError> {
    let program = runtime_program_or_default(program, source);
    let resolved_program = resolve_runtime_program(&app, &program);
    let mut command = Command::new(&resolved_program);
    command
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt as _;
        command.process_group(0);
    }

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt as _;
        command.creation_flags(0x00000010);
    }

    if let Some((key, value)) = env {
        command.env(key, value);
    }

    let mut child = command.spawn().map_err(|error| {
        HarborError::Runtime(format!(
            "Could not start {source} from `{}`: {error}. Install it with `brew install {}` or set an absolute path in Harbor.",
            resolved_program.to_string_lossy(),
            if source == "sing-box" { "sing-box" } else { "cloudflared" }
        ))
    })?;

    if let Some(stdout) = child.stdout.take() {
        spawn_log_reader(app.clone(), source, "stdout", stdout);
    }

    if let Some(stderr) = child.stderr.take() {
        spawn_log_reader(app, source, "stderr", stderr);
    }

    Ok(child)
}

fn spawn_log_reader<R>(app: AppHandle, source: &'static str, stream: &'static str, reader: R)
where
    R: Read + Send + 'static,
{
    thread::spawn(move || {
        for line in BufReader::new(reader).lines().map_while(Result::ok) {
            let _ = app.emit(
                "harbor-log",
                HarborLogEvent {
                    source: source.to_string(),
                    stream: stream.to_string(),
                    line,
                },
            );
        }
    });
}

fn refresh_child(child: &mut Option<Child>) {
    let Some(process) = child.as_mut() else {
        return;
    };

    match process.try_wait() {
        Ok(Some(_)) | Err(_) => {
            *child = None;
        }
        Ok(None) => {}
    }
}

fn stop_child(child: &mut Option<Child>) {
    let Some(mut process) = child.take() else {
        return;
    };

    let pid = process.id();

    #[cfg(unix)]
    {
        unsafe {
            libc::killpg(pid as i32, libc::SIGTERM);
        }
        for _ in 0..30 {
            if process.try_wait().unwrap_or(None).is_some() {
                return;
            }
            thread::sleep(Duration::from_millis(100));
        }
        unsafe {
            libc::killpg(pid as i32, libc::SIGKILL);
        }
        let _ = process.wait();
    }

    #[cfg(not(unix))]
    {
        let _ = process.kill();
        let _ = process.wait();
    }
}

pub fn force_kill_all_runtime_processes() {
    #[cfg(unix)]
    {
        for process_name in ["sing-box", "cloudflared"] {
            let output = std::process::Command::new("pkill")
                .args(["-9", "-x", process_name])
                .output();
            let _ = output;
        }
    }
}

impl Drop for HarborRuntime {
    fn drop(&mut self) {
        self.stop();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sing_box_args_should_run_generated_config() {
        let args = sing_box_args(Path::new("/tmp/harbor/sing-box.json"));

        assert_eq!(args, ["run", "-c", "/tmp/harbor/sing-box.json"]);
    }

    #[test]
    fn cloudflared_args_should_run_named_tunnel_without_exposing_token() {
        let args = cloudflared_args();

        assert_eq!(args, ["tunnel", "--no-autoupdate", "run"]);
    }

    #[test]
    fn cloudflared_token_env_should_reject_empty_token() {
        let error = cloudflared_token_env("   ").expect_err("blank token is invalid");

        assert_eq!(error.to_string(), "Cloudflare tunnel token is required");
    }

    #[test]
    fn cloudflared_token_env_should_store_token_outside_argv() {
        let (key, value) = cloudflared_token_env("abc123").expect("token should build env");

        assert_eq!(key, "TUNNEL_TOKEN");
        assert_eq!(value, "abc123");
    }

    #[test]
    fn config_path_should_use_stable_file_name() {
        assert_eq!(
            config_path(Path::new("/tmp/harbor")),
            PathBuf::from("/tmp/harbor/sing-box.json")
        );
    }

    #[test]
    fn resolve_system_program_should_prefer_homebrew_path_when_available() {
        let path = resolve_system_program_with("sing-box", |candidate| {
            candidate == Path::new("/opt/homebrew/bin/sing-box")
        });

        assert_eq!(path, PathBuf::from("/opt/homebrew/bin/sing-box"));
    }

    #[test]
    fn resolve_system_program_should_keep_custom_path() {
        let path = resolve_system_program_with("/custom/bin/cloudflared", |_| false);

        assert_eq!(path, PathBuf::from("/custom/bin/cloudflared"));
    }

    #[test]
    fn runtime_program_or_default_should_use_bundled_name_for_blank_paths() {
        assert_eq!(runtime_program_or_default("   ", "sing-box"), "sing-box");
        assert_eq!(
            runtime_program_or_default(" /custom/bin/cloudflared ", "cloudflared"),
            "/custom/bin/cloudflared"
        );
    }

    #[test]
    fn check_port_available_should_pass_on_unused_port_range() {
        use std::net::UdpSocket;
        let sock = UdpSocket::bind(SocketAddrV4::new(Ipv4Addr::LOCALHOST, 0))
            .expect("should bind UDP to find a free TCP port");
        let port = sock.local_addr().unwrap().port();
        drop(sock);
        let result = check_port_available(port);
        assert!(result.is_ok(), "expected port {} to be free: {:?}", port, result);
    }

    #[test]
    fn check_port_available_should_fail_on_occupied_port() {
        let listener = TcpListener::bind(SocketAddrV4::new(Ipv4Addr::LOCALHOST, 0))
            .expect("should bind to random port");
        let port = listener.local_addr().unwrap().port();
        let result = check_port_available(port);
        assert!(result.is_err());
        let msg = result.unwrap_err().to_string();
        assert!(msg.contains(&port.to_string()));
        assert!(msg.contains("already in use"));
    }
}
