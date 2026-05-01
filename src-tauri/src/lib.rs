pub mod config;
pub mod runtime;

#[cfg(not(test))]
use std::sync::Mutex;

#[cfg(not(test))]
use runtime::{
    check_dependencies, force_kill_all_runtime_processes, get_default_settings, get_status,
    preview_settings, start_harbor, stop_harbor, update_tray_icon, HarborRuntime,
};

#[cfg(not(test))]
use tauri::{
    image::Image,
    menu::{MenuBuilder, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};

#[cfg(not(test))]
pub struct TrayState {
    tray: tauri::tray::TrayIcon,
    locale: Mutex<String>,
}

#[cfg(not(test))]
fn tray_labels(locale: &str) -> (String, String, String, String, String, String, String) {
    let is_zh = locale == "zh-CN";
    (
        if is_zh { "显示 Harbor" } else { "Show Harbor" }.to_string(),
        if is_zh { "开始服务" } else { "Start Service" }.to_string(),
        if is_zh { "停止服务" } else { "Stop Service" }.to_string(),
        if is_zh { "关于 Harbor" } else { "About Harbor" }.to_string(),
        if is_zh { "退出 Harbor" } else { "Quit Harbor" }.to_string(),
        if is_zh { "Harbor - 个人出口节点" } else { "Harbor - Personal Exit Node" }.to_string(),
        if is_zh { "Harbor - 服务运行中" } else { "Harbor - Running" }.to_string(),
    )
}

#[cfg(not(test))]
fn build_tray_menu_for(
    app: &tauri::AppHandle,
    locale: &str,
) -> Result<tauri::menu::Menu<tauri::Wry>, Box<dyn std::error::Error>> {
    let (show_label, start_label, stop_label, about_label, quit_label, _idle_tooltip, _running_tooltip) = tray_labels(locale);

    let show_item = MenuItem::new(app, show_label, true, None::<&str>)?;
    let separator1 = PredefinedMenuItem::separator(app)?;
    let start_item = MenuItem::with_id(app, "start", start_label, true, None::<&str>)?;
    let stop_item = MenuItem::with_id(app, "stop", stop_label, true, None::<&str>)?;
    let separator2 = PredefinedMenuItem::separator(app)?;
    let about_item = MenuItem::with_id(app, "about", about_label, true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", quit_label, true, None::<&str>)?;

    let menu = MenuBuilder::new(app)
        .item(&show_item)
        .item(&separator1)
        .item(&start_item)
        .item(&stop_item)
        .item(&separator2)
        .item(&about_item)
        .item(&quit_item)
        .build()?;

    Ok(menu)
}

#[cfg(not(test))]
fn handle_tray_menu_event(app: &tauri::AppHandle, event_id: &str) {
    match event_id {
        "quit" => {
            let state = app.state::<Mutex<HarborRuntime>>();
            if let Ok(mut runtime) = state.lock() {
                runtime.stop();
            }
            app.exit(0);
        }
        "start" => {
            let _ = app.get_webview_window("main").map(|w| {
                let _ = w.show();
                let _ = w.set_focus();
            });
            app.emit("tray-action", "start").unwrap_or_else(|e| {
                eprintln!("Failed to emit tray start: {}", e);
            });
        }
        "stop" => {
            app.emit("tray-action", "stop").unwrap_or_else(|e| {
                eprintln!("Failed to emit tray stop: {}", e);
            });
        }
        "about" => {
            let _ = app.get_webview_window("main").map(|w| {
                let _ = w.show();
                let _ = w.set_focus();
            });
            app.emit("tray-action", "about").unwrap_or_else(|e| {
                eprintln!("Failed to emit tray about: {}", e);
            });
        }
        _ => {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
    }
}

#[cfg(not(test))]
#[cfg(unix)]
fn install_signal_handlers() {
    use std::sync::atomic::{AtomicBool, Ordering};
    static CLEANED_UP: AtomicBool = AtomicBool::new(false);

    extern "C" fn signal_handler(sig: i32) {
        if CLEANED_UP.swap(true, Ordering::SeqCst) {
            return;
        }
        eprintln!("Harbor: received signal {}, cleaning up runtime processes...", sig);
        force_kill_all_runtime_processes();
        let _ = std::process::Command::new("pkill")
            .args(["-9", "-x", "sing-box"])
            .output();
        let _ = std::process::Command::new("pkill")
            .args(["-9", "-x", "cloudflared"])
            .output();
        std::process::exit(128 + sig);
    }

    unsafe {
        libc::signal(libc::SIGTERM, signal_handler as *const () as usize);
        libc::signal(libc::SIGINT, signal_handler as *const () as usize);
        libc::signal(libc::SIGHUP, signal_handler as *const () as usize);
    }
}

#[cfg(not(test))]
fn load_tray_icon<'a>(app: &'a tauri::App, name: &str) -> Image<'a> {
    let path = app
        .path()
        .resolve(name, tauri::path::BaseDirectory::Resource)
        .unwrap_or_else(|_| {
            panic!("Failed to resolve tray icon resource: {}", name)
        });
    Image::from_path(&path).unwrap_or_else(|e| {
        panic!("Failed to load tray icon {}: {}", path.display(), e)
    })
}

#[cfg(not(test))]
fn is_autostarted() -> bool {
    std::env::args().any(|arg| arg == "--autostarted")
}

#[cfg(not(test))]
#[tauri::command]
fn set_locale(app: tauri::AppHandle, locale: String) -> Result<(), String> {
    let tray_state = app.state::<TrayState>();

    {
        let mut current = tray_state.locale.lock().map_err(|e| e.to_string())?;
        *current = locale.clone();
    }

    let menu = build_tray_menu_for(&app, &locale).map_err(|e| e.to_string())?;
    tray_state.tray.set_menu(Some(menu)).map_err(|e| e.to_string())?;

    Ok(())
}

#[cfg(not(test))]
pub fn run() {
    #[cfg(unix)]
    install_signal_handlers();

    tauri::Builder::default()
        .manage(Mutex::new(HarborRuntime::default()))
        .invoke_handler(tauri::generate_handler![
            check_dependencies,
            get_default_settings,
            preview_settings,
            start_harbor,
            stop_harbor,
            get_status,
            update_tray_icon,
            set_locale
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                window.hide().unwrap_or_else(|e| {
                    eprintln!("Failed to hide window: {}", e);
                });
                api.prevent_close();
            }
        })
        .setup(|app| {
            app.handle().plugin(
                tauri_plugin_autostart::init(
                    tauri_plugin_autostart::MacosLauncher::LaunchAgent,
                    Some(vec!["--autostarted"]),
                ),
            )?;

            let menu = build_tray_menu_for(app.handle(), "en")?;

            let idle_icon = load_tray_icon(app, "icons/icon-tray.png");

            let tray = TrayIconBuilder::new()
                .icon(idle_icon)
                .tooltip("Harbor - Personal Exit Node")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| {
                    handle_tray_menu_event(&app, event.id.as_ref());
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            app.manage(TrayState {
                tray,
                locale: Mutex::new("en".to_string()),
            });

            if is_autostarted() {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Harbor");
}

#[cfg(test)]
pub fn run() {}
