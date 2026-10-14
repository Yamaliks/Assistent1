use crate::launch_validation::validate_local_path;

// Reuse the launch service's path rules; checking never starts a process.
#[tauri::command]
pub fn check_application_exe(path: String) -> Result<(), String> {
    validate_local_path(&path, true)?;
    let resolved =
        std::fs::canonicalize(&path).map_err(|e| format!("EXE не найден или недоступен: {e}"))?;
    let local = resolved.to_str().ok_or("Некорректный путь")?;
    validate_local_path(local.strip_prefix(r"\\?\").unwrap_or(local), true)?;
    if !resolved.is_file() {
        return Err("Выбранный путь не является EXE-файлом".into());
    }
    Ok(())
}

#[tauri::command]
pub async fn pick_application_exe(window: tauri::Window) -> Result<Option<String>, String> {
    #[cfg(not(windows))]
    {
        let _ = window;
        Err("Выбор EXE доступен только в Windows".into())
    }
    #[cfg(windows)]
    {
        let (tx, rx) = std::sync::mpsc::channel();
        let owner = window.clone();
        window
            .run_on_main_thread(move || {
                let _ = tx.send(pick_exe(&owner));
            })
            .map_err(|e| e.to_string())?;
        tauri::async_runtime::spawn_blocking(move || rx.recv().map_err(|e| e.to_string()))
            .await
            .map_err(|e| e.to_string())??
    }
}

#[cfg(windows)]
fn pick_exe(window: &tauri::Window) -> Result<Option<String>, String> {
    let selected = pick_file(window, "Приложения EXE\0*.exe\0\0")?;
    if let Some(path) = &selected {
        check_application_exe(path.clone())?;
    }
    Ok(selected)
}

#[cfg(windows)]
fn pick_file(window: &tauri::Window, pattern: &str) -> Result<Option<String>, String> {
    use windows_sys::Win32::UI::Controls::Dialogs::*;
    let mut path = vec![0u16; 32768];
    let filter: Vec<u16> = pattern.encode_utf16().collect();
    let mut dialog: OPENFILENAMEW = unsafe { std::mem::zeroed() };
    dialog.lStructSize = std::mem::size_of::<OPENFILENAMEW>() as u32;
    dialog.hwndOwner = window.hwnd().map_err(|e| e.to_string())?.0;
    dialog.lpstrFilter = filter.as_ptr();
    dialog.lpstrFile = path.as_mut_ptr();
    dialog.nMaxFile = path.len() as u32;
    dialog.Flags = OFN_FILEMUSTEXIST
        | OFN_PATHMUSTEXIST
        | OFN_NOCHANGEDIR
        | OFN_EXPLORER
        | OFN_DONTADDTORECENT;
    // Buffers and owner HWND remain valid for the entire modal native call.
    if unsafe { GetOpenFileNameW(&mut dialog) } == 0 {
        let error = unsafe { CommDlgExtendedError() };
        return if error == 0 {
            Ok(None)
        } else {
            Err(format!("Ошибка выбора файла: {error}"))
        };
    }
    let end = path
        .iter()
        .position(|&c| c == 0)
        .ok_or("Некорректный путь")?;
    let selected = String::from_utf16(&path[..end]).map_err(|e| e.to_string())?;
    Ok(Some(selected))
}

#[tauri::command]
pub async fn pick_sol_archive(window: tauri::Window) -> Result<Option<String>, String> {
    if window.label() != "main" {
        return Err("Установка доступна в главном окне".into());
    }
    #[cfg(not(windows))]
    {
        Err("Выбор пакета доступен в Windows".into())
    }
    #[cfg(windows)]
    {
        let (tx, rx) = std::sync::mpsc::channel();
        let owner = window.clone();
        window
            .run_on_main_thread(move || {
                let _ = tx.send(pick_file(&owner, "Пакет SOL ZIP\0*.zip\0\0"));
            })
            .map_err(|e| e.to_string())?;
        tauri::async_runtime::spawn_blocking(move || rx.recv().map_err(|e| e.to_string()))
            .await
            .map_err(|e| e.to_string())??
    }
}
