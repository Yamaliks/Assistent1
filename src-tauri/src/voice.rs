use std::sync::{Mutex, MutexGuard, OnceLock};
#[cfg(windows)]
mod native {
    use std::{
        ffi::{c_char, c_int, c_void, CStr, CString},
        path::Path,
    };
    type NewModel = unsafe extern "C" fn(*const c_char) -> *mut c_void;
    type Free = unsafe extern "C" fn(*mut c_void);
    type NewRecognizer = unsafe extern "C" fn(*mut c_void, f32) -> *mut c_void;
    type Accept = unsafe extern "C" fn(*mut c_void, *const i16, c_int) -> c_int;
    type ResultText = unsafe extern "C" fn(*mut c_void) -> *const c_char;
    pub struct Session {
        pub token: String,
        model: *mut c_void,
        recognizer: *mut c_void,
        model_free: Free,
        recognizer_free: Free,
        accept: Accept,
        result: ResultText,
        _library: libloading::Library,
    }
    // All calls and destruction are serialized by STATE. Vosk handles are never accessed in parallel.
    unsafe impl Send for Session {}
    impl Drop for Session {
        fn drop(&mut self) {
            unsafe {
                (self.recognizer_free)(self.recognizer);
                (self.model_free)(self.model);
            }
        }
    }
    impl Session {
        pub fn new(root: &Path, rate: u32, token: String) -> Result<Self, String> {
            if !root.join("model/am/final.mdl").is_file() {
                return Err("Установите русскую модель в разделе SOL".into());
            }
            // Absolute DLL path; dependencies may load only from its directory or trusted system dirs.
            let library: libloading::Library = unsafe {
                libloading::os::windows::Library::load_with_flags(
                    root.join("runtime/libvosk.dll"),
                    0x100 | 0x1000,
                )
            }
            .map_err(|e| format!("Не удалось загрузить Vosk x64. Установите runtime: {e}"))?
            .into();
            unsafe {
                let new_model: NewModel = *library
                    .get(b"vosk_model_new\0")
                    .map_err(|e| e.to_string())?;
                let model_free: Free = *library
                    .get(b"vosk_model_free\0")
                    .map_err(|e| e.to_string())?;
                let new_recognizer: NewRecognizer = *library
                    .get(b"vosk_recognizer_new\0")
                    .map_err(|e| e.to_string())?;
                let recognizer_free: Free = *library
                    .get(b"vosk_recognizer_free\0")
                    .map_err(|e| e.to_string())?;
                let accept: Accept = *library
                    .get(b"vosk_recognizer_accept_waveform_s\0")
                    .map_err(|e| e.to_string())?;
                let result: ResultText = *library
                    .get(b"vosk_recognizer_result\0")
                    .map_err(|e| e.to_string())?;
                let log: unsafe extern "C" fn(c_int) = *library
                    .get(b"vosk_set_log_level\0")
                    .map_err(|e| e.to_string())?;
                log(-1);
                let path = CString::new(root.join("model").to_str().ok_or("Путь модели не UTF-8")?)
                    .map_err(|e| e.to_string())?;
                let model = new_model(path.as_ptr());
                if model.is_null() {
                    return Err(
                        "Vosk не смог прочитать модель. Переустановите официальный пакет".into(),
                    );
                }
                let recognizer = new_recognizer(model, rate as f32);
                if recognizer.is_null() {
                    model_free(model);
                    return Err("Не удалось создать распознаватель".into());
                }
                Ok(Self {
                    token,
                    model,
                    recognizer,
                    model_free,
                    recognizer_free,
                    accept,
                    result,
                    _library: library,
                })
            }
        }
        pub fn feed(&self, samples: &[i16]) -> Result<Option<String>, String> {
            let accepted =
                unsafe { (self.accept)(self.recognizer, samples.as_ptr(), samples.len() as c_int) };
            if accepted < 0 {
                return Err("Vosk отклонил аудиопоток".into());
            }
            if accepted == 0 {
                return Ok(None);
            }
            let raw = unsafe { (self.result)(self.recognizer) };
            if raw.is_null() {
                return Err("Пустой ответ Vosk".into());
            }
            let value: serde_json::Value =
                serde_json::from_slice(unsafe { CStr::from_ptr(raw) }.to_bytes())
                    .map_err(|e| e.to_string())?;
            let text = value["text"]
                .as_str()
                .ok_or("Некорректный ответ Vosk")?
                .trim();
            Ok((!text.is_empty()).then(|| text.to_string()))
        }
    }
}
pub struct VoiceState {
    #[cfg(windows)]
    session: Option<native::Session>,
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
            guard.session = Some(native::Session::new(&root, rate, token.clone())?);
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
