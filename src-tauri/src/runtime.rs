use std::{
    fs,
    io::{BufRead, BufReader, Read},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::Mutex,
    thread,
    time::Duration,
};

use serde::Serialize;
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
    thread::sleep(Duration::from_millis(150));
    runtime.refresh();

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
        refresh_child(&mut self.sing_box);
        refresh_child(&mut self.cloudflared);
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
    let program = program.trim();

    if program.is_empty() {
        return Err(HarborError::Validation(format!("{source} path is required")));
    }

    let resolved_program = resolve_runtime_program(&app, program);
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
    }

    #[cfg(not(unix))]
    {
        let _ = process.kill();
    }

    let _ = process.wait();
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
}
