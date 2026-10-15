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
        crate::bundled_assets::validate_trusted(root)?;
        let library = load_runtime(root)?;
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

/// LoadLibraryExW requires an absolute path with Windows separators. In particular,
/// do not pass a Path::join("runtime/libvosk.dll") string containing a forward slash.
pub fn load_runtime(root: &Path) -> Result<libloading::Library, String> {
    let path = root
        .join("runtime")
        .join("libvosk.dll")
        .canonicalize()
        .map_err(|e| format!("Не найден Vosk: {e}"))?;
    unsafe { libloading::os::windows::Library::load_with_flags(&path, 0x100 | 0x800) }
        .map(Into::into)
        // Display in libloading 0.7 discards the nested Win32 error; Debug preserves
        // its raw_os_error and message (126 missing dependency, 193 wrong machine, ...).
        .map_err(|e| format!("Vosk x64 · {} · LoadLibraryExW: {e:?}", path.display()))
}
