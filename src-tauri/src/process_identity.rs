#[derive(Clone, Copy, Debug, PartialEq)]
pub enum RunningState {
    AlreadyRunning,
    BackgroundOnly,
    NotRunning,
    Unknown,
}
#[derive(Debug)]
pub struct Inspection {
    pub state: RunningState,
    pub pids: Vec<u32>,
    pub window_count: usize,
    pub reason: String,
    pub windows_error: Option<u32>,
}
// A process alone is not proof that a usable application window is available.
pub fn classify(matching: usize, available_windows: usize, uncertain: bool) -> RunningState {
    if matching > 0 && available_windows > 0 {
        RunningState::AlreadyRunning
    } else if uncertain {
        RunningState::Unknown
    } else if matching > 0 {
        RunningState::BackgroundOnly
    } else {
        RunningState::NotRunning
    }
}
#[cfg(windows)]
mod native {
    use super::*;
    use windows_sys::Win32::{
        Foundation::{
            CloseHandle, GetLastError, ERROR_NO_MORE_FILES, HANDLE, INVALID_HANDLE_VALUE, RECT,
        },
        Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_CLOAKED},
        Storage::FileSystem::{
            CreateFileW, GetFileInformationByHandle, GetFinalPathNameByHandleW,
            BY_HANDLE_FILE_INFORMATION, FILE_FLAG_BACKUP_SEMANTICS, FILE_READ_ATTRIBUTES,
            FILE_SHARE_DELETE, FILE_SHARE_READ, FILE_SHARE_WRITE, OPEN_EXISTING, VOLUME_NAME_GUID,
        },
        System::{
            Diagnostics::ToolHelp::{
                CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
                TH32CS_SNAPPROCESS,
            },
            Threading::{
                GetExitCodeProcess, OpenProcess, QueryFullProcessImageNameW,
                PROCESS_QUERY_LIMITED_INFORMATION,
            },
        },
        UI::WindowsAndMessaging::{
            EnumWindows, GetWindowLongPtrW, GetWindowRect, GetWindowThreadProcessId,
            IsHungAppWindow, IsWindowVisible, GWL_EXSTYLE, WS_EX_TOOLWINDOW,
        },
    };
    pub struct OwnedHandle(pub HANDLE);
    impl Drop for OwnedHandle {
        fn drop(&mut self) {
            unsafe {
                CloseHandle(self.0);
            }
        }
    }
    #[derive(Debug, PartialEq)]
    struct FileKey(String, u32, u32);
    fn file_key(path: &str) -> Result<FileKey, Option<u32>> {
        let wide: Vec<u16> = path.encode_utf16().chain(Some(0)).collect();
        let raw = unsafe {
            CreateFileW(
                wide.as_ptr(),
                FILE_READ_ATTRIBUTES,
                FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
                std::ptr::null(),
                OPEN_EXISTING,
                FILE_FLAG_BACKUP_SEMANTICS,
                std::ptr::null_mut(),
            )
        };
        if raw == INVALID_HANDLE_VALUE {
            return Err(Some(unsafe { GetLastError() }));
        }
        let handle = OwnedHandle(raw);
        let mut info: BY_HANDLE_FILE_INFORMATION = unsafe { std::mem::zeroed() };
        if unsafe { GetFileInformationByHandle(handle.0, &mut info) } == 0 {
            return Err(Some(unsafe { GetLastError() }));
        }
        if info.nFileIndexHigh == 0 && info.nFileIndexLow == 0 {
            return Err(None);
        }
        // A volume serial number can be cloned. Use the mounted volume GUID plus file ID.
        let mut final_path = vec![0u16; 32768];
        let size = unsafe {
            GetFinalPathNameByHandleW(
                handle.0,
                final_path.as_mut_ptr(),
                final_path.len() as u32,
                VOLUME_NAME_GUID,
            )
        };
        if size == 0 {
            return Err(Some(unsafe { GetLastError() }));
        }
        if size as usize >= final_path.len() {
            return Err(None);
        }
        let final_path = String::from_utf16(&final_path[..size as usize]).map_err(|_| None)?;
        let end = final_path.find('}').ok_or(None)?;
        let volume = final_path[..=end].to_ascii_lowercase();
        if !volume.starts_with(r"\\?\volume{") {
            return Err(None);
        }
        Ok(FileKey(volume, info.nFileIndexHigh, info.nFileIndexLow))
    }
    struct Windows {
        pids: Vec<u32>,
        count: usize,
        uncertain: bool,
        hung: bool,
        error: Option<u32>,
    }
    unsafe extern "system" fn window_callback(
        hwnd: windows_sys::Win32::Foundation::HWND,
        data: isize,
    ) -> i32 {
        let state = unsafe { &mut *(data as *mut Windows) };
        let mut pid = 0;
        unsafe {
            GetWindowThreadProcessId(hwnd, &mut pid);
        }
        if !state.pids.contains(&pid)
            || unsafe { IsWindowVisible(hwnd) } == 0
            || (unsafe { GetWindowLongPtrW(hwnd, GWL_EXSTYLE) } as u32 & WS_EX_TOOLWINDOW) != 0
        {
            return 1;
        }
        if unsafe { IsHungAppWindow(hwnd) } != 0 {
            state.hung = true;
            state.uncertain = true;
            return 1;
        }
        let mut rect: RECT = unsafe { std::mem::zeroed() };
        let mut cloaked = 0u32;
        if unsafe { GetWindowRect(hwnd, &mut rect) } == 0 {
            state.error = Some(unsafe { GetLastError() });
            state.uncertain = true;
            return 1;
        }
        let hr = unsafe {
            DwmGetWindowAttribute(
                hwnd,
                DWMWA_CLOAKED as u32,
                (&mut cloaked as *mut u32).cast(),
                std::mem::size_of::<u32>() as u32,
            )
        };
        if hr < 0 {
            state.error = Some(hr as u32);
            state.uncertain = true;
            return 1;
        }
        // IsWindowVisible includes minimized taskbar windows; zero-area/service windows do not qualify.
        if rect.right > rect.left && rect.bottom > rect.top && cloaked == 0 {
            state.count += 1;
        }
        1
    }
    pub fn inspect(target: &str) -> Inspection {
        let mut unknown = false;
        let mut error = None;
        let mut matches = Vec::new();
        let target_key = match file_key(target) {
            Ok(key) => key,
            Err(code) => {
                return Inspection {
                    state: RunningState::Unknown,
                    pids: vec![],
                    window_count: 0,
                    reason: "Не удалось проверить идентичность выбранного EXE".into(),
                    windows_error: code,
                }
            }
        };
        // Reject accidental selection of Assistent1 itself instead of silently calling it Steam.
        if std::env::current_exe()
            .ok()
            .and_then(|p| p.to_str().and_then(|p| file_key(p).ok()))
            .as_ref()
            == Some(&target_key)
        {
            return Inspection {
                state: RunningState::Unknown,
                pids: vec![],
                window_count: 0,
                reason: "Выбран EXE самого Assistent1. Проверьте путь в библиотеке".into(),
                windows_error: None,
            };
        }
        let raw = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) };
        if raw == INVALID_HANDLE_VALUE {
            return Inspection {
                state: RunningState::Unknown,
                pids: vec![],
                window_count: 0,
                reason: "Windows не разрешила прочитать список процессов".into(),
                windows_error: Some(unsafe { GetLastError() }),
            };
        }
        let snapshot = OwnedHandle(raw);
        let mut entry: PROCESSENTRY32W = unsafe { std::mem::zeroed() };
        entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
        let filename = target
            .rsplit(['\\', '/'])
            .next()
            .unwrap_or("")
            .to_lowercase();
        let mut more = unsafe { Process32FirstW(snapshot.0, &mut entry) };
        while more != 0 {
            let end = entry
                .szExeFile
                .iter()
                .position(|c| *c == 0)
                .unwrap_or(entry.szExeFile.len());
            // A name is only a filter. Volume/file identity, not name or lowercased path, decides a match.
            let named_candidate =
                String::from_utf16_lossy(&entry.szExeFile[..end]).to_lowercase() == filename;
            if entry.th32ProcessID != std::process::id() {
                let raw = unsafe {
                    OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, entry.th32ProcessID)
                };
                if raw.is_null() {
                    if named_candidate {
                        unknown = true;
                        error = Some(unsafe { GetLastError() });
                    }
                } else {
                    let process = OwnedHandle(raw);
                    let mut code = 0;
                    if unsafe { GetExitCodeProcess(process.0, &mut code) } == 0 {
                        if named_candidate {
                            unknown = true;
                            error = Some(unsafe { GetLastError() });
                        }
                    } else if code == 259 {
                        let mut buffer = vec![0u16; 32768];
                        let mut size = buffer.len() as u32;
                        if unsafe {
                            QueryFullProcessImageNameW(process.0, 0, buffer.as_mut_ptr(), &mut size)
                        } == 0
                        {
                            if named_candidate {
                                unknown = true;
                                error = Some(unsafe { GetLastError() });
                            }
                        } else {
                            match String::from_utf16(&buffer[..size as usize]) {
                                Ok(path) => match file_key(&path) {
                                    Ok(key) if key == target_key => {
                                        matches.push((entry.th32ProcessID, process))
                                    }
                                    Ok(_) => {}
                                    Err(code) => {
                                        if named_candidate {
                                            unknown = true;
                                            error = code;
                                        }
                                    }
                                },
                                Err(_) => {
                                    if named_candidate {
                                        unknown = true;
                                    }
                                }
                            }
                        }
                    }
                }
            }
            more = unsafe { Process32NextW(snapshot.0, &mut entry) };
        }
        let code = unsafe { GetLastError() };
        if code != ERROR_NO_MORE_FILES {
            unknown = true;
            error = Some(code);
        }
        // Keep process handles until after enumeration; confirm liveness again before using its PID.
        let pids: Vec<u32> = matches
            .iter()
            .filter_map(|(pid, process)| {
                let mut code = 0;
                if unsafe { GetExitCodeProcess(process.0, &mut code) } != 0 && code == 259 {
                    Some(*pid)
                } else {
                    unknown = true;
                    None
                }
            })
            .collect();
        let mut windows = Windows {
            pids: pids.clone(),
            count: 0,
            uncertain: false,
            hung: false,
            error: None,
        };
        if !pids.is_empty()
            && unsafe {
                EnumWindows(
                    Some(window_callback),
                    (&mut windows as *mut Windows) as isize,
                )
            } == 0
        {
            windows.uncertain = true;
            error = Some(unsafe { GetLastError() });
        }
        if windows.error.is_some() {
            error = windows.error;
        }
        let state = classify(pids.len(), windows.count, unknown || windows.uncertain);
        let reason = match state {
            RunningState::Unknown if windows.hung => {
                "Подтверждён EXE, но его окно не отвечает. Повторный запуск не выполнен"
            }
            RunningState::AlreadyRunning => {
                "Подтверждён тот же EXE и доступное окно (в том числе свёрнутое)"
            }
            RunningState::BackgroundOnly => {
                "Подтверждён тот же EXE, но доступного окна нет. Повторный запуск не выполнен"
            }
            RunningState::NotRunning => "Совпадающий работающий EXE не найден",
            RunningState::Unknown => "Не удалось достоверно проверить путь, процесс или окно",
        };
        Inspection {
            state,
            pids,
            window_count: windows.count,
            reason: reason.into(),
            windows_error: error,
        }
    }
}
#[cfg(windows)]
pub use native::inspect;
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn closed_steam_never_means_already_running() {
        assert_eq!(classify(0, 0, false), RunningState::NotRunning);
    }
    #[test]
    fn visible_and_minimized_owned_window_qualify_but_background_does_not() {
        assert_eq!(classify(1, 1, false), RunningState::AlreadyRunning);
        assert_eq!(classify(1, 0, false), RunningState::BackgroundOnly);
    }
    #[test]
    fn access_denial_is_unknown_not_running() {
        assert_eq!(classify(0, 0, true), RunningState::Unknown);
        assert_eq!(classify(1, 0, true), RunningState::Unknown);
    }
}
