pub mod config;
pub mod runtime;

#[cfg(not(test))]
use std::sync::Mutex;

#[cfg(not(test))]
use runtime::{
    get_default_settings, get_status, preview_settings, start_harbor, stop_harbor, HarborRuntime,
};

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
        .run(tauri::generate_context!())
        .expect("error while running Harbor");
}

#[cfg(test)]
pub fn run() {}
