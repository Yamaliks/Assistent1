use serde::{Deserialize, Serialize};
#[derive(Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Target {
    pub id: String,
    pub name: String,
    pub path: String,
}
#[derive(Serialize)]
pub struct Candidate {
    pub id: String,
    pub name: String,
    pub windows: usize,
}
#[derive(Serialize)]
pub struct Plan {
    pub token: String,
    pub candidates: Vec<Candidate>,
    pub warnings: Vec<String>,
}
#[derive(Serialize)]
pub struct CloseResult {
    pub name: String,
    pub closed: bool,
    pub message: String,
}

#[cfg(windows)]
mod native {
    use super::*;
    use crate::process_identity::{inspect, RunningState};
    use std::{
        sync::{Mutex, OnceLock},
        time::{Duration, Instant},
    };
    use windows_sys::Win32::{
        Foundation::{CloseHandle, FILETIME, HWND, RECT},
        Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_CLOAKED},
        System::Threading::{
            GetExitCodeProcess, GetProcessTimes, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION,
        },
        UI::WindowsAndMessaging::{
            EnumWindows, GetWindowLongPtrW, GetWindowRect, GetWindowThreadProcessId,
            IsHungAppWindow, IsWindow, IsWindowVisible, PostMessageW, GWL_EXSTYLE, GWL_STYLE,
            WM_CLOSE, WS_DISABLED, WS_EX_TOOLWINDOW,
        },
    };
    struct Proof {
        hwnd: usize,
        pid: u32,
        thread: u32,
        created: u64,
    }
    struct Entry {
        target: Target,
        windows: Vec<Proof>,
    }
    struct Prepared {
        token: String,
        at: Instant,
        entries: Vec<Entry>,
    }
    static PLAN: OnceLock<Mutex<Option<Prepared>>> = OnceLock::new();
    fn state() -> &'static Mutex<Option<Prepared>> {
        PLAN.get_or_init(|| Mutex::new(None))
    }
    fn created(pid: u32) -> Option<u64> {
        let handle = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
        if handle.is_null() {
            return None;
        }
        let mut times: [FILETIME; 4] = unsafe { std::mem::zeroed() };
        let ok = unsafe {
            GetProcessTimes(
                handle,
                &mut times[0],
                &mut times[1],
                &mut times[2],
                &mut times[3],
            )
        };
        let mut exit = 0;
        let live = unsafe { GetExitCodeProcess(handle, &mut exit) } != 0 && exit == 259;
        unsafe {
            CloseHandle(handle);
        }
        (ok != 0 && live)
            .then_some(((times[0].dwHighDateTime as u64) << 32) | times[0].dwLowDateTime as u64)
    }
    fn usable(hwnd: HWND) -> bool {
        let mut rect: RECT = unsafe { std::mem::zeroed() };
        let mut cloaked = 0u32;
        unsafe {
            IsWindowVisible(hwnd) != 0
                && (GetWindowLongPtrW(hwnd, GWL_STYLE) as u32 & WS_DISABLED) == 0
                && IsHungAppWindow(hwnd) == 0
                && (GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32 & WS_EX_TOOLWINDOW) == 0
                && GetWindowRect(hwnd, &mut rect) != 0
                && rect.right > rect.left
                && rect.bottom > rect.top
                && DwmGetWindowAttribute(
                    hwnd,
                    DWMWA_CLOAKED as u32,
                    (&mut cloaked as *mut u32).cast(),
                    4,
                ) >= 0
                && cloaked == 0
        }
    }
    struct Scan {
        pids: Vec<u32>,
        windows: Vec<Proof>,
    }
    unsafe extern "system" fn collect(hwnd: HWND, data: isize) -> i32 {
        let scan = unsafe { &mut *(data as *mut Scan) };
        let mut pid = 0;
        let thread = unsafe { GetWindowThreadProcessId(hwnd, &mut pid) };
        if scan.pids.contains(&pid) && usable(hwnd) {
            if let Some(created) = created(pid) {
                scan.windows.push(Proof {
                    hwnd: hwnd as usize,
                    pid,
                    thread,
                    created,
                });
            }
        }
        1
    }
    fn browser(path: &str) -> bool {
        let name = path
            .rsplit(['\\', '/'])
            .next()
            .unwrap_or("")
            .to_ascii_lowercase();
        [
            "chrome.exe",
            "msedge.exe",
            "firefox.exe",
            "browser.exe",
            "opera.exe",
            "brave.exe",
            "vivaldi.exe",
            "iexplore.exe",
        ]
        .contains(&name.as_str())
            || crate::windows_launch::default_browser_exe()
                .ok()
                .is_some_and(|p| crate::process_identity::same_file(path, &p))
    }
    pub fn prepare(previous: Vec<Target>, next: Vec<Target>) -> Result<Plan, String> {
        if previous.len() > 256 || next.len() > 256 {
            return Err("Слишком много приложений для безопасной проверки".into());
        }
        let mut entries: Vec<Entry> = Vec::new();
        let mut warnings = Vec::new();
        for target in previous {
            if let Err(reason) = crate::launch_validation::validate_local_path(&target.path, true) {
                warnings.push(format!("{}: {}", target.name, reason));
                continue;
            }
            if browser(&target.path)
                || next.iter().any(|n| {
                    n.id == target.id
                        || (crate::launch_validation::validate_local_path(&n.path, true).is_ok()
                            && crate::process_identity::same_file(&n.path, &target.path))
                })
                || entries
                    .iter()
                    .any(|e| crate::process_identity::same_file(&e.target.path, &target.path))
            {
                continue;
            }
            let check = inspect(&target.path);
            if check.state == RunningState::NotRunning {
                continue;
            }
            if check.state != RunningState::AlreadyRunning {
                warnings.push(format!(
                    "{}: закрытие не предложено — {}",
                    target.name, check.reason
                ));
                continue;
            }
            let mut scan = Scan {
                pids: check.pids,
                windows: vec![],
            };
            if unsafe { EnumWindows(Some(collect), (&mut scan as *mut Scan) as isize) } == 0 {
                warnings.push(format!("{}: окна недоступны", target.name));
                continue;
            }
            if !scan.windows.is_empty() {
                entries.push(Entry {
                    target,
                    windows: scan.windows,
                });
            }
        }
        static SEQUENCE: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let token = format!(
            "{}-{}",
            std::process::id(),
            SEQUENCE.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        );
        let candidates = entries
            .iter()
            .map(|e| Candidate {
                id: e.target.id.clone(),
                name: e.target.name.clone(),
                windows: e.windows.len(),
            })
            .collect();
        *state()
            .lock()
            .map_err(|_| "Проверка переключения недоступна")? = Some(Prepared {
            token: token.clone(),
            at: Instant::now(),
            entries,
        });
        Ok(Plan {
            token,
            candidates,
            warnings,
        })
    }
    fn matches(proof: &Proof) -> bool {
        let hwnd = proof.hwnd as HWND;
        let mut pid = 0;
        (unsafe { IsWindow(hwnd) != 0 && GetWindowThreadProcessId(hwnd, &mut pid) == proof.thread })
            && pid == proof.pid
            && created(pid) == Some(proof.created)
    }
    pub fn finish(token: String, selected: Vec<String>) -> Result<Vec<CloseResult>, String> {
        let mut state = state()
            .lock()
            .map_err(|_| "Проверка переключения недоступна")?;
        let prepared = state.as_ref().ok_or("Подтверждение устарело")?;
        if prepared.token != token || prepared.at.elapsed() > Duration::from_secs(300) {
            return Err("Подтверждение устарело. Запустите режим ещё раз".into());
        }
        if selected
            .iter()
            .any(|id| !prepared.entries.iter().any(|e| e.target.id == *id))
        {
            return Err("Неизвестное приложение в подтверждении".into());
        }
        let prepared = state.take().unwrap();
        drop(state);
        let mut result = Vec::new();
        for entry in prepared
            .entries
            .into_iter()
            .filter(|e| selected.contains(&e.target.id))
        {
            let check = inspect(&entry.target.path);
            let mut error = None;
            for proof in &entry.windows {
                if !matches(proof) {
                    continue;
                } // Closed/replaced while the confirmation was visible.
                if !check.pids.contains(&proof.pid) || !usable(proof.hwnd as HWND) {
                    error =
                        Some("Окно изменилось или недоступно; закрытие не выполнено".to_string());
                    break;
                }
                if unsafe { PostMessageW(proof.hwnd as HWND, WM_CLOSE, 0, 0) } == 0 {
                    error = Some(format!(
                        "Windows отказала в штатном закрытии: {}",
                        std::io::Error::last_os_error()
                    ));
                    break;
                }
            }
            if error.is_none() {
                let started = Instant::now();
                while entry
                    .windows
                    .iter()
                    .any(|proof| matches(proof) || created(proof.pid) == Some(proof.created))
                    && started.elapsed() < Duration::from_secs(3)
                {
                    std::thread::sleep(Duration::from_millis(30));
                }
                if entry
                    .windows
                    .iter()
                    .any(|proof| matches(proof) || created(proof.pid) == Some(proof.created))
                {
                    error = Some("Приложение или его фоновый процесс не закрылись. Проверьте его диалог сохранения; принудительное завершение не применяется".into());
                }
                if error.is_none() {
                    let after = inspect(&entry.target.path);
                    if after.state != RunningState::NotRunning {
                        error = Some(format!(
                            "Закрытие приложения не подтверждено: {}",
                            after.reason
                        ));
                    }
                }
            }
            result.push(CloseResult {
                name: entry.target.name,
                closed: error.is_none(),
                message: error.unwrap_or_else(|| "Окна закрыты штатно".into()),
            });
        }
        Ok(result)
    }
}
#[cfg(windows)]
pub use native::{finish, prepare};
