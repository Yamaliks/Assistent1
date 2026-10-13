#[derive(Debug, PartialEq)]
pub enum RunningState {
    AlreadyRunning,
    NotRunning,
    Unknown,
}
fn normalized(path: &str) -> String {
    path.strip_prefix(r"\\?\")
        .unwrap_or(path)
        .replace('/', r"\")
        .to_lowercase()
}
pub fn evaluate_candidates(
    target: &str,
    candidates: impl IntoIterator<Item = Result<String, ()>>,
) -> RunningState {
    let target = normalized(target);
    let mut unknown = false;
    for candidate in candidates {
        match candidate {
            Ok(path) if normalized(&path) == target => return RunningState::AlreadyRunning,
            Err(()) => unknown = true,
            _ => {}
        }
    }
    if unknown {
        RunningState::Unknown
    } else {
        RunningState::NotRunning
    }
}

#[cfg(windows)]
pub fn inspect(target: &str) -> Result<RunningState, String> {
    use windows_sys::Win32::{
        Foundation::{
            CloseHandle, GetLastError, ERROR_NO_MORE_FILES, HANDLE, INVALID_HANDLE_VALUE,
        },
        System::{
            Diagnostics::ToolHelp::{
                CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
                TH32CS_SNAPPROCESS,
            },
            Threading::{
                OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION,
            },
        },
    };
    struct OwnedHandle(HANDLE);
    impl Drop for OwnedHandle {
        fn drop(&mut self) {
            unsafe {
                CloseHandle(self.0);
            }
        }
    }
    let raw = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) };
    if raw == INVALID_HANDLE_VALUE {
        return Err("Windows не разрешила проверить запущенные приложения".into());
    }
    let snapshot = OwnedHandle(raw);
    let mut entry: PROCESSENTRY32W = unsafe { std::mem::zeroed() };
    entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
    let filename = target
        .rsplit(['\\', '/'])
        .next()
        .ok_or("Некорректный EXE")?
        .to_lowercase();
    let mut candidates = Vec::new();
    let mut more = unsafe { Process32FirstW(snapshot.0, &mut entry) };
    while more != 0 {
        let end = entry
            .szExeFile
            .iter()
            .position(|c| *c == 0)
            .unwrap_or(entry.szExeFile.len());
        // The kernel filename is only a filter; identity always requires the full EXE path.
        if String::from_utf16_lossy(&entry.szExeFile[..end]).to_lowercase() == filename {
            let process =
                unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, entry.th32ProcessID) };
            if process.is_null() {
                candidates.push(Err(()));
            } else {
                let process = OwnedHandle(process);
                let mut buffer = vec![0u16; 32768];
                let mut size = buffer.len() as u32;
                if unsafe {
                    QueryFullProcessImageNameW(process.0, 0, buffer.as_mut_ptr(), &mut size)
                } == 0
                {
                    candidates.push(Err(()));
                } else {
                    let path = String::from_utf16(&buffer[..size as usize]).map_err(|_| ());
                    candidates.push(path.and_then(|path| {
                        std::fs::canonicalize(path)
                            .map_err(|_| ())
                            .and_then(|path| path.to_str().map(str::to_owned).ok_or(()))
                    }));
                }
            }
        }
        more = unsafe { Process32NextW(snapshot.0, &mut entry) };
    }
    if unsafe { GetLastError() } != ERROR_NO_MORE_FILES {
        return Err("Не удалось полностью проверить список приложений Windows".into());
    }
    Ok(evaluate_candidates(target, candidates))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn identity_requires_path_not_just_same_process_name() {
        assert_eq!(
            evaluate_candidates(r"C:\Apps\Music.exe", [Ok(r"D:\Other\Music.exe".into())]),
            RunningState::NotRunning
        );
        assert_eq!(
            evaluate_candidates(r"C:\Apps\Music.exe", [Ok(r"\\?\c:\apps\MUSIC.EXE".into())]),
            RunningState::AlreadyRunning
        );
    }
    #[test]
    fn inaccessible_identity_is_unknown_but_proven_match_wins() {
        assert_eq!(
            evaluate_candidates(r"C:\Apps\Music.exe", [Err(())]),
            RunningState::Unknown
        );
        assert_eq!(
            evaluate_candidates(
                r"C:\Apps\Music.exe",
                [Err(()), Ok(r"C:\Apps\Music.exe".into())]
            ),
            RunningState::AlreadyRunning
        );
        assert_eq!(
            evaluate_candidates(r"C:\Apps\Music.exe", []),
            RunningState::NotRunning
        );
    }
}
