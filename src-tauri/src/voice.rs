use std::sync::{Mutex, MutexGuard, OnceLock};

pub struct VoiceState {
    #[cfg(windows)]
    session: Option<crate::vosk::Session>,
}
static STATE: OnceLock<Mutex<VoiceState>> = OnceLock::new();
fn state() -> &'static Mutex<VoiceState> {
    STATE.get_or_init(|| {
        Mutex::new(VoiceState {
            #[cfg(windows)]
            session: None,
        })
    })
}
pub fn installation_guard() -> Result<MutexGuard<'static, VoiceState>, String> {
    let guard = state().lock().map_err(|_| "Голосовая служба недоступна")?;
    #[cfg(windows)]
    if guard.session.is_some() {
        return Err("Остановите SOL перед установкой пакета".into());
    }
    Ok(guard)
}
pub fn stop_all() {
    if let Ok(mut guard) = state().lock() {
        #[cfg(windows)]
        {
            guard.session = None;
        }
        let _ = &mut guard;
    }
}
#[tauri::command]
pub async fn sol_start(
    app: tauri::AppHandle,
    window: tauri::Window,
    rate: u32,
) -> Result<String, String> {
    if window.label() != "main" || !(8000..=96000).contains(&rate) {
        return Err("Недопустимый источник аудио".into());
    }
    let root = crate::sol_asset_commands::root(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        #[cfg(windows)]
        {
            let mut guard = state().lock().map_err(|_| "Голосовая служба недоступна")?;
            if guard.session.is_some() {
                return Err("SOL уже слушает".into());
            }
            static TOKEN: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
            let token = TOKEN
                .fetch_add(1, std::sync::atomic::Ordering::Relaxed)
                .to_string();
            guard.session = Some(crate::vosk::Session::new(&root, rate, token.clone())?);
            Ok(token)
        }
        #[cfg(not(windows))]
        {
            let _ = root;
            Err("Локальный Vosk runtime подключён для Windows x64".into())
        }
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn sol_feed(
    window: tauri::Window,
    token: String,
    samples: Vec<i16>,
) -> Result<Option<String>, String> {
    if window.label() != "main" || samples.is_empty() || samples.len() > 16000 {
        return Err("Некорректный аудиоблок".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        #[cfg(windows)]
        {
            let guard = state().lock().map_err(|_| "Голосовая служба недоступна")?;
            let session = guard
                .session
                .as_ref()
                .filter(|s| s.token == token)
                .ok_or("Сессия SOL остановлена")?;
            session.feed(&samples)
        }
        #[cfg(not(windows))]
        {
            let _ = token;
            Err("Vosk доступен в Windows".into())
        }
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub fn sol_stop(window: tauri::Window, token: String) -> Result<(), String> {
    if window.label() != "main" {
        return Err("Микрофоном управляет главное окно".into());
    }
    #[cfg(windows)]
    {
        let mut guard = state().lock().map_err(|_| "Голосовая служба недоступна")?;
        if guard.session.as_ref().is_some_and(|s| s.token == token) {
            guard.session = None;
        }
    }
    #[cfg(not(windows))]
    let _ = token;
    Ok(())
}
