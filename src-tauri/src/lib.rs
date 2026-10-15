use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, WindowEvent,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
mod actions;
mod applications;
mod bundled_assets;
mod launch_types;
mod launch_validation;
mod mode_switch;
mod mode_switch_commands;
mod process_identity;
mod sol_asset_commands;
mod sol_assets;
mod voice;
#[cfg(windows)]
mod vosk;
mod window_lifecycle;
#[cfg(windows)]
mod windows_launch;

impl WindowOperations for tauri::WebviewWindow {
    fn show(&self) -> Result<(), String> {
        self.show().map_err(|e| e.to_string())
    }
    fn unminimize(&self) -> Result<(), String> {
        self.unminimize().map_err(|e| e.to_string())
    }
    fn focus(&self) -> Result<(), String> {
        self.set_focus().map_err(|e| e.to_string())
    }
    fn hide(&self) -> Result<(), String> {
        self.hide().map_err(|e| e.to_string())
    }
}
use window_lifecycle::{close_to_tray, restore, WindowOperations};

fn request_main(app: &tauri::AppHandle) {
    let handle = app.clone();
    // Windows single-instance messages may arrive during a native window callback.
    // Queue UI work instead of blocking WM_COPYDATA while the second process waits.
    if let Err(error) = app.run_on_main_thread(move || {
        if let Err(error) = show_main(handle, None) {
            eprintln!("Could not restore main window: {error}");
        }
    }) {
        eprintln!("Could not schedule main window restore: {error}");
    }
}

fn restore_palette(app: &tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("palette")
        .ok_or("Palette window missing")?;
    window.center().map_err(|e| e.to_string())?;
    restore(&window)?;
    window.emit("palette-focus", ()).map_err(|e| e.to_string())
}

// Native shortcut callbacks must not synchronously block the window event loop.
#[tauri::command]
fn show_palette(app: tauri::AppHandle) -> Result<(), String> {
    let handle = app.clone();
    app.run_on_main_thread(move || {
        if let Err(error) = restore_palette(&handle) {
            eprintln!("Could not restore command palette: {error}");
            let _ = handle.emit("palette-error", error);
        }
    })
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn show_main(app: tauri::AppHandle, page: Option<String>) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or("Main window missing")?;
    restore(&window)?;
    if let Some(page) = page {
        if !matches!(
            page.as_str(),
            "modes" | "settings" | "commands" | "applications" | "voice"
        ) {
            return Err("Unsupported page".into());
        }
        window.emit("navigate", page).map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        // Must remain first: a second launch exits before registering a tray or shortcut.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            request_main(app)
        }))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        if let Err(error) = show_palette(app.clone()) {
                            eprintln!("Could not show command palette: {error}");
                        }
                    }
                })
                .build(),
        )
        .setup(|app| {
            let open =
                MenuItem::with_id(app, "open_main", "Открыть Assistent1", true, None::<&str>)?;
            let palette = MenuItem::with_id(
                app,
                "open_palette",
                "Открыть панель команд",
                true,
                None::<&str>,
            )?;
            let exit = MenuItem::with_id(app, "exit", "Выход", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &palette, &exit])?;
            let icon = app
                .default_window_icon()
                .cloned()
                .ok_or("Missing application tray icon")?;
            // Tauri retains the registered tray resource for the application's lifetime.
            TrayIconBuilder::with_id("assistent1-tray")
                .icon(icon)
                .tooltip("Assistent1")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open_main" => request_main(app),
                    "open_palette" => {
                        if let Err(error) = show_palette(app.clone()) {
                            eprintln!("Could not show command palette: {error}");
                        }
                    }
                    // Explicit exit bypasses close-to-tray. No ExitRequested prevention.
                    "exit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if matches!(
                        event,
                        TrayIconEvent::DoubleClick {
                            button: MouseButton::Left,
                            ..
                        }
                    ) {
                        request_main(tray.app_handle());
                    }
                })
                .build(app)?;
            // Registration failure (for example, a shortcut conflict) is a startup error,
            // rather than silently advertising a nonworking global shortcut.
            app.global_shortcut().register("Ctrl+Alt+Space")?;
            // Initially hidden while WebView/windows are constructed: never expose a HWND
            // before Tauri attaches CloseRequested handlers. Always show it after setup.
            // Identical first-launch behavior in dev and release; no cfg(debug_assertions).
            show_main(app.handle().clone(), None)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if matches!(window.label(), "main" | "palette") {
                    // Prevent destruction first; both configured windows remain reusable.
                    api.prevent_close();
                    if window.label() == "main" {
                        let _ = window.emit("sol-stop", ());
                        tauri::async_runtime::spawn_blocking(voice::stop_all);
                    }
                    if let Some(webview) = window.app_handle().get_webview_window(window.label()) {
                        if let Err(error) = close_to_tray(&webview) {
                            eprintln!("Could not hide window to tray: {error}");
                        }
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            show_palette,
            show_main,
            actions::execute_action,
            applications::check_application_exe,
            applications::pick_application_exe,
            applications::pick_sol_archive,
            mode_switch_commands::prepare_mode_switch,
            mode_switch_commands::confirm_mode_switch,
            sol_asset_commands::sol_asset_status,
            sol_asset_commands::sol_install,
            sol_asset_commands::sol_audio,
            voice::sol_start,
            voice::sol_feed,
            voice::sol_stop
        ])
        .run(tauri::generate_context!())
        .expect("Unable to start Assistent1");
}
