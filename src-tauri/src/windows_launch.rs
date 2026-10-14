use super::launch_types::*;
use super::launch_validation::{validate_local_path, validate_url};
use super::process_identity::{inspect, RunningState};
pub fn execute(action: LaunchAction) -> Result<LaunchReport, LaunchFailure> {
    match action {
        LaunchAction::Program {
            target,
            minimized,
            skip_if_running,
        } => launch_program(&target, minimized, skip_if_running),
        LaunchAction::Browser { minimized } => {
            launch_program(&default_browser_exe()?, minimized, true)
        }
        LaunchAction::Website { target } => open_association(&validate_url(&target)?),
        LaunchAction::Folder { target } => {
            validate_local_path(&target, false)?;
            let path = std::fs::canonicalize(&target).map_err(|e| {
                io_failure(
                    "Папка не найдена или недоступна",
                    e,
                    LaunchDetails::default(),
                )
            })?;
            let local = path
                .to_str()
                .ok_or("Некорректный путь папки")?
                .strip_prefix(r"\\?\")
                .unwrap_or(path.to_str().unwrap());
            validate_local_path(local, false)?;
            if !path.is_dir() {
                return Err("Выбранный путь не является папкой".into());
            }
            open_association(local)
        }
    }
}
fn io_failure(message: &str, error: std::io::Error, mut details: LaunchDetails) -> LaunchFailure {
    details.windows_error = error.raw_os_error().map(|code| code as u32);
    LaunchFailure {
        message: message.into(),
        details,
    }
}
pub fn launch_program(
    target: &str,
    minimized: bool,
    skip: bool,
) -> Result<LaunchReport, LaunchFailure> {
    let mut details = LaunchDetails {
        path: Some(target.into()),
        minimized_requested: minimized,
        ..LaunchDetails::default()
    };
    let result = (|| {
        validate_local_path(target, true)?;
        let path = std::fs::canonicalize(target)
            .map_err(|e| io_failure("EXE не найден или недоступен", e, details.clone()))?;
        let resolved = path.to_str().ok_or("Некорректный путь EXE")?;
        let local = resolved.strip_prefix(r"\\?\").unwrap_or(resolved);
        validate_local_path(local, true)?;
        details.canonical_path = Some(local.into());
        if !path.is_file() {
            return Err("Указанный путь не является EXE-файлом".into());
        }
        static CHECK_AND_LAUNCH: std::sync::Mutex<()> = std::sync::Mutex::new(());
        let _guard = if skip {
            Some(
                CHECK_AND_LAUNCH
                    .lock()
                    .map_err(|_| "Не удалось безопасно проверить повторный запуск")?,
            )
        } else {
            None
        };
        if skip {
            let check = inspect(local);
            details.inspection = Some(check.reason);
            details.pids = check.pids;
            details.window_count =
                if check.state == RunningState::Unknown && details.pids.is_empty() {
                    None
                } else {
                    Some(check.window_count)
                };
            details.windows_error = check.windows_error;
            match check.state {
                RunningState::AlreadyRunning => return Ok(LaunchReport { outcome: LaunchOutcome::AlreadyRunning, message: "Уже работает: подтверждены EXE и доступное окно".into(), details: details.clone() }),
                RunningState::BackgroundOnly => return Ok(LaunchReport { outcome: LaunchOutcome::StateUnknown, message: "Есть фоновый процесс без доступного окна. Повторный запуск не выполнен. Для ручного запуска отключите проверку повторного запуска в библиотеке.".into(), details: details.clone() }),
                RunningState::Unknown => return Ok(LaunchReport { outcome: LaunchOutcome::StateUnknown, message: "Не удалось определить состояние. Повторный запуск не выполнен. Проверьте путь; при необходимости отключите проверку повторного запуска в библиотеке.".into(), details: details.clone() }),
                RunningState::NotRunning => {},
            }
        } else {
            details.inspection = Some("Проверка повторного запуска выключена пользователем".into());
        }
        let directory = path
            .parent()
            .ok_or("У EXE нет родительской папки")?
            .to_str()
            .ok_or("Некорректная папка EXE")?;
        let pid = create_process(
            local,
            directory.strip_prefix(r"\\?\").unwrap_or(directory),
            minimized,
        )
        .map_err(|e| io_failure("Windows не смогла запустить EXE", e, details.clone()))?;
        details.pids = vec![pid];
        Ok(LaunchReport { outcome: LaunchOutcome::Launched, message: if minimized { "Запущено. Windows передан запрос свёрнутого окна; приложение может его игнорировать." } else { "Запущено. Готовность окна не подтверждалась." }.into(), details: details.clone() })
    })();
    result.map_err(|mut failure: LaunchFailure| {
        if failure.details.path.is_none() {
            let code = failure.details.windows_error;
            failure.details = details;
            if code.is_some() {
                failure.details.windows_error = code;
            }
        }
        failure
    })
}
fn create_process(path: &str, directory: &str, minimized: bool) -> Result<u32, std::io::Error> {
    use windows_sys::Win32::{
        Foundation::CloseHandle,
        System::Threading::{
            CreateProcessW, PROCESS_INFORMATION, STARTF_USESHOWWINDOW, STARTUPINFOW,
        },
        UI::WindowsAndMessaging::SW_SHOWMINNOACTIVE,
    };
    let wide = |text: &str| text.encode_utf16().chain(Some(0)).collect::<Vec<u16>>();
    let path = wide(path);
    let directory = wide(directory);
    let mut startup: STARTUPINFOW = unsafe { std::mem::zeroed() };
    startup.cb = std::mem::size_of::<STARTUPINFOW>() as u32;
    if minimized {
        startup.dwFlags = STARTF_USESHOWWINDOW;
        startup.wShowWindow = SW_SHOWMINNOACTIVE as u16;
    }
    let mut info: PROCESS_INFORMATION = unsafe { std::mem::zeroed() };
    // Exact validated lpApplicationName, no command line, no inherited handles or user arguments.
    if unsafe {
        CreateProcessW(
            path.as_ptr(),
            std::ptr::null_mut(),
            std::ptr::null(),
            std::ptr::null(),
            0,
            0,
            std::ptr::null(),
            directory.as_ptr(),
            &startup,
            &mut info,
        )
    } == 0
    {
        return Err(std::io::Error::last_os_error());
    }
    unsafe {
        CloseHandle(info.hThread);
        CloseHandle(info.hProcess);
    }
    Ok(info.dwProcessId)
}
#[cfg(windows)]
fn open_association(target: &str) -> Result<LaunchReport, LaunchFailure> {
    shell_open(
        target,
        None,
        windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL,
    )
}

#[cfg(windows)]
fn shell_open(
    target: &str,
    directory: Option<&str>,
    show: i32,
) -> Result<LaunchReport, LaunchFailure> {
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
        return Ok(LaunchReport {
            outcome: LaunchOutcome::Launched,
            message: "Запрос открытия выполнен".into(),
            details: LaunchDetails::default(),
        });
    }
    let reason = match result {
        2 | 3 => "Адрес или папка не найдены",
        5 => "Windows отказала в доступе",
        31 | 27 => "Нет приложения по умолчанию для открытия",
        0 | 8 => "Недостаточно ресурсов Windows",
        _ => "Windows не смогла открыть адрес",
    };
    Err(LaunchFailure {
        message: reason.into(),
        details: LaunchDetails {
            windows_error: Some(result as u32),
            ..LaunchDetails::default()
        },
    })
}

#[cfg(windows)]
pub(crate) fn default_browser_exe() -> Result<String, LaunchFailure> {
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
        return Err(LaunchFailure { message: "Не удалось определить EXE браузера по умолчанию. В моей библиотеке отключите браузер по умолчанию и выберите его EXE.".into(), details: LaunchDetails { windows_error: (status != 0).then_some(status as u32), ..LaunchDetails::default() } });
    }
    String::from_utf16(&buffer[..length as usize - 1])
        .map_err(|_| "Некорректный путь браузера. Выберите его EXE в библиотеке.".into())
}
