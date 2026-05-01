pub mod config;
pub mod runtime;

#[cfg(not(test))]
use std::sync::Mutex;

#[cfg(not(test))]
use runtime::{
    get_default_settings, get_status, preview_settings, start_harbor, stop_harbor, HarborRuntime,
};

#[cfg(not(test))]
use tauri::Manager;

#[cfg(not(test))]
pub fn run() {
    tauri::Builder::default()
        .manage(Mutex::new(HarborRuntime::default()))
        .invoke_handler(tauri::generate_handler![
            get_default_settings,
            preview_settings,
            start_harbor,
            stop_harbor,
            get_status
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                let state = window.state::<Mutex<HarborRuntime>>();
                if let Ok(mut runtime) = state.lock() {
                    runtime.stop();
                };
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Harbor");
}

#[cfg(test)]
pub fn run() {}
