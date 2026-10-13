use serde::{Deserialize, Serialize};
#[derive(Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum LaunchOutcome {
    Launched,
    AlreadyRunning,
}

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase", deny_unknown_fields)]
pub enum LaunchAction {
    Program {
        target: String,
        #[serde(default)]
        minimized: bool,
        #[serde(default)]
        skip_if_running: bool,
    },
    Browser {
        #[serde(default)]
        minimized: bool,
    },
    Website {
        target: String,
    },
    Folder {
        target: String,
    },
}

#[tauri::command]
pub async fn execute_action(action: LaunchAction) -> Result<LaunchOutcome, String> {
    tauri::async_runtime::spawn_blocking(move || execute(action))
        .await
        .map_err(|e| format!("Ошибка обработки команды: {e}"))?
}

#[cfg(not(windows))]
fn execute(_action: LaunchAction) -> Result<LaunchOutcome, String> {
    Err("Запуск системных действий поддерживается только на Windows".into())
}

#[cfg(windows)]
fn execute(action: LaunchAction) -> Result<LaunchOutcome, String> {
    use super::launch_validation::{validate_local_path, validate_url};
    let program = matches!(&action, LaunchAction::Program { .. });
    match action {
        LaunchAction::Website { target } => open_association(&validate_url(&target)?),
        LaunchAction::Browser { minimized } => execute(LaunchAction::Program {
            target: default_browser_exe()?,
            minimized,
            skip_if_running: true,
        }),
        LaunchAction::Program { ref target, .. } | LaunchAction::Folder { ref target } => {
            let minimized = matches!(
                &action,
                LaunchAction::Program {
                    minimized: true,
                    ..
                }
            );
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
                // Serialize this application's guarded check+launch requests. This does not
                // lock or manipulate other processes; external launches may still race us.
                static CHECK_AND_LAUNCH: std::sync::Mutex<()> = std::sync::Mutex::new(());
                let _guard = if matches!(
                    &action,
                    LaunchAction::Program {
                        skip_if_running: true,
                        ..
                    }
                ) {
                    Some(
                        CHECK_AND_LAUNCH
                            .lock()
                            .map_err(|_| "Не удалось безопасно проверить повторный запуск")?,
                    )
                } else {
                    None
                };
                if matches!(
                    &action,
                    LaunchAction::Program {
                        skip_if_running: true,
                        ..
                    }
                ) {
                    match super::process_identity::inspect(local)? {
                        super::process_identity::RunningState::AlreadyRunning => return Ok(LaunchOutcome::AlreadyRunning),
                        super::process_identity::RunningState::Unknown => return Err("Не удалось достоверно проверить полный путь работающего приложения. Повторный запуск не выполнен; проверьте приложение вручную.".into()),
                        super::process_identity::RunningState::NotRunning => {},
                    }
                }
                if minimized {
                    return shell_open(
                        local,
                        path.parent().and_then(|p| p.to_str()),
                        windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWMINNOACTIVE,
                    );
                }
                // One executable path, zero user arguments. Never cmd /c, PowerShell, or shell strings.
                let mut child = std::process::Command::new(&path)
                    .current_dir(path.parent().ok_or("У приложения нет родительской папки")?)
                    .spawn()
                    .map_err(|e| format!("Windows не смогла запустить приложение: {e}"))?;
                std::thread::spawn(move || {
                    let _ = child.wait();
                });
                Ok(LaunchOutcome::Launched)
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
fn open_association(target: &str) -> Result<LaunchOutcome, String> {
    shell_open(
        target,
        None,
        windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL,
    )
}

#[cfg(windows)]
fn shell_open(target: &str, directory: Option<&str>, show: i32) -> Result<LaunchOutcome, String> {
    use windows_sys::Win32::UI::Shell::ShellExecuteW;
    let wide = |text: &str| {
        text.encode_utf16()
            .chain(std::iter::once(0))
            .collect::<Vec<u16>>()
    };
    let verb = wide("open");
    let target = wide(target);
    let directory = directory.map(wide);
    // The validated URL/directory is lpFile; no shell command or parameters are supplied.
    let result = unsafe {
        ShellExecuteW(
            std::ptr::null_mut(),
            verb.as_ptr(),
            target.as_ptr(),
            std::ptr::null(),
            directory
                .as_ref()
                .map_or(std::ptr::null(), |dir| dir.as_ptr()),
            show,
        )
    } as isize;
    if result > 32 {
        return Ok(LaunchOutcome::Launched);
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

#[cfg(windows)]
fn default_browser_exe() -> Result<String, String> {
    use windows_sys::Win32::UI::Shell::{
        AssocQueryStringW, ASSOCF_NOTRUNCATE, ASSOCSTR_EXECUTABLE,
    };
    let protocol: Vec<u16> = "http".encode_utf16().chain(Some(0)).collect();
    let verb: Vec<u16> = "open".encode_utf16().chain(Some(0)).collect();
    let mut buffer = vec![0u16; 32768];
    let mut length = buffer.len() as u32;
    let status = unsafe {
        AssocQueryStringW(
            ASSOCF_NOTRUNCATE,
            ASSOCSTR_EXECUTABLE,
            protocol.as_ptr(),
            verb.as_ptr(),
            buffer.as_mut_ptr(),
            &mut length,
        )
    };
    if status != 0 || length < 2 || length as usize > buffer.len() {
        return Err("Не удалось определить EXE браузера по умолчанию. В моей библиотеке отключите браузер по умолчанию и выберите его EXE.".into());
    }
    String::from_utf16(&buffer[..length as usize - 1])
        .map_err(|_| "Некорректный путь браузера. Выберите его EXE в библиотеке.".into())
}
