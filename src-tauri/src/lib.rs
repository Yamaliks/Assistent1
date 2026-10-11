use tauri::{Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
mod actions;
mod launch_validation;

// Always reuse configured windows. No command ever creates another palette.
#[tauri::command]
fn show_palette(app: tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("palette")
        .ok_or("Palette window missing")?;
    window.center().map_err(|e| e.to_string())?;
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())
}

#[tauri::command]
fn show_main(app: tauri::AppHandle, page: Option<String>) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or("Main window missing")?;
    window.unminimize().map_err(|e| e.to_string())?;
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
    if let Some(page) = page {
        if !matches!(page.as_str(), "modes" | "settings" | "commands") {
            return Err("Unsupported page".into());
        }
        window.emit("navigate", page).map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Err(error) = show_main(app.clone(), None) {
                eprintln!("Could not focus existing application: {error}");
            }
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
            // Registration failure (for example, a shortcut conflict) is a startup error,
            // rather than silently advertising a nonworking global shortcut.
            app.global_shortcut().register("Ctrl+Alt+Space")?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            show_palette,
            show_main,
            actions::execute_action
        ])
        .run(tauri::generate_context!())
        .expect("Unable to start Assistent1");
}
