use serde::Deserialize;

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase", deny_unknown_fields)]
pub enum LaunchAction {
    Program { target: String },
    Website { target: String },
    Folder { target: String },
}

#[tauri::command]
pub async fn execute_action(action: LaunchAction) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || execute(action))
        .await
        .map_err(|e| format!("Ошибка обработки команды: {e}"))?
}

#[cfg(not(windows))]
fn execute(_action: LaunchAction) -> Result<(), String> {
    Err("Запуск системных действий поддерживается только на Windows".into())
}

#[cfg(windows)]
fn execute(action: LaunchAction) -> Result<(), String> {
    use super::launch_validation::{validate_local_path, validate_url};
    let program = matches!(&action, LaunchAction::Program { .. });
    match action {
        LaunchAction::Website { target } => open_association(&validate_url(&target)?),
        LaunchAction::Program { target } | LaunchAction::Folder { target } => {
            validate_local_path(&target, program)?;
            let path = std::fs::canonicalize(&target)
                .map_err(|e| format!("Путь не найден или недоступен: {e}"))?;
            // Resolve symlinks/junctions and reject anything resolving to a remote/device path.
            let resolved = path.to_str().ok_or("Путь содержит недопустимые символы")?;
            let local = resolved.strip_prefix(r"\\?\").unwrap_or(resolved);
            validate_local_path(local, program)?;
            if program {
                if !path.is_file() {
                    return Err("Указанный путь не является EXE-файлом".into());
                }
                // One executable path, zero user arguments. Never cmd /c, PowerShell, or shell strings.
                let mut child = std::process::Command::new(&path)
                    .current_dir(path.parent().ok_or("У приложения нет родительской папки")?)
                    .spawn()
                    .map_err(|e| format!("Windows не смогла запустить приложение: {e}"))?;
                std::thread::spawn(move || {
                    let _ = child.wait();
                });
                Ok(())
            } else {
                if !path.is_dir() {
                    return Err("Указанный путь не является папкой".into());
                }
                open_association(local)
            }
        }
    }
}

#[cfg(windows)]
fn open_association(target: &str) -> Result<(), String> {
    use windows_sys::Win32::UI::{Shell::ShellExecuteW, WindowsAndMessaging::SW_SHOWNORMAL};
    let wide = |text: &str| {
        text.encode_utf16()
            .chain(std::iter::once(0))
            .collect::<Vec<u16>>()
    };
    let verb = wide("open");
    let target = wide(target);
    // The validated URL/directory is lpFile; no shell command or parameters are supplied.
    let result = unsafe {
        ShellExecuteW(
            std::ptr::null_mut(),
            verb.as_ptr(),
            target.as_ptr(),
            std::ptr::null(),
            std::ptr::null(),
            SW_SHOWNORMAL,
        )
    } as isize;
    if result > 32 {
        return Ok(());
    }
    let reason = match result {
        2 | 3 => "Адрес или папка не найдены",
        5 => "Windows отказала в доступе",
        31 | 27 => "Нет приложения по умолчанию для открытия",
        0 | 8 => "Недостаточно ресурсов Windows",
        _ => "Windows не смогла открыть адрес",
    };
    Err(format!("{reason} (код {result})"))
}
