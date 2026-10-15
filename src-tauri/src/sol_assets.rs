use sha2::{Digest, Sha256};
use std::{
    io::{Read, Write},
    path::Path,
};
pub const RUNTIME_HASH: &str = "f1dcc9cca460630f81ea8f71794f69c80bed6556d2a4e6237b5785e1d2dff34b";
pub const AUDIO_IDS: &[&str] = &[
    "hello",
    "listening",
    "opening",
    "mode",
    "done",
    "errors",
    "unknown",
    "cancelled",
    "goodbye",
];
fn valid_model(path: &Path) -> bool {
    [
        "am/final.mdl",
        "conf/mfcc.conf",
        "conf/model.conf",
        "graph/HCLr.fst",
        "graph/Gr.fst",
        "graph/phones/word_boundary.int",
    ]
    .iter()
    .all(|f| path.join(f).is_file())
}
pub fn valid_audio(path: &Path) -> Result<(), String> {
    let value: serde_json::Value = serde_json::from_slice(
        &std::fs::read(path.join("manifest.json")).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    if value["license"]
        .as_str()
        .is_none_or(|s| s.trim().is_empty())
        || value["author"].as_str().is_none_or(|s| s.trim().is_empty())
    {
        return Err("Укажите автора и разрешение на использование в manifest.json".into());
    }
    for id in AUDIO_IDS {
        let file = path.join(format!("{id}.wav"));
        let metadata = std::fs::metadata(&file).map_err(|_| format!("Нет записи {id}.wav"))?;
        if metadata.len() > 4_000_000 {
            return Err("Запись должна быть короче 4 МБ".into());
        }
        validate_wav(&std::fs::read(file).map_err(|e| e.to_string())?)?;
    }
    Ok(())
}
fn validate_wav(bytes: &[u8]) -> Result<(), String> {
    if bytes.len() < 44 || &bytes[..4] != b"RIFF" || &bytes[8..12] != b"WAVE" {
        return Err("Нужна настоящая запись WAV PCM16".into());
    }
    let u32_at =
        |offset: usize| u32::from_le_bytes(bytes[offset..offset + 4].try_into().unwrap()) as usize;
    if u32_at(4) + 8 != bytes.len() {
        return Err("Неполный WAV".into());
    }
    let mut offset = 12;
    let mut format = false;
    let mut data = false;
    while offset + 8 <= bytes.len() {
        let length = u32_at(offset + 4);
        let start = offset + 8;
        if length > bytes.len() - start {
            return Err("Повреждён WAV chunk".into());
        }
        if &bytes[offset..offset + 4] == b"fmt " {
            let u16_at = |n: usize| u16::from_le_bytes(bytes[n..n + 2].try_into().unwrap());
            if length < 16
                || u16_at(start) != 1
                || ![1, 2].contains(&u16_at(start + 2))
                || u16_at(start + 14) != 16
                || !(8000..=48000).contains(&u32_at(start + 4))
            {
                return Err("Поддерживается WAV PCM16 mono/stereo 8–48 kHz".into());
            }
            format = true;
        }
        if &bytes[offset..offset + 4] == b"data" && length > 0 && length % 2 == 0 {
            data = true;
        }
        offset = start + length + length % 2;
    }
    if !format || !data {
        return Err("В WAV нет формата или звуковых данных".into());
    }
    Ok(())
}
pub fn install(root: &Path, kind: &str, archive: &Path, expected: &str) -> Result<String, String> {
    let (prefix, destination, expected) = match kind {
        "runtime" => ("vosk-win64-0.3.45", "runtime", RUNTIME_HASH),
        "model" => ("vosk-model-small-ru-0.22", "model", expected.trim()),
        "audio" => ("sol-voice", "audio", expected.trim()),
        _ => return Err("Неизвестный пакет".into()),
    };
    if expected.len() != 64 || !expected.bytes().all(|c| c.is_ascii_hexdigit()) {
        return Err("Укажите SHA-256 ZIP из доверенного источника (64 hex-символа)".into());
    }
    let file = std::fs::File::open(archive).map_err(|e| e.to_string())?;
    if file.metadata().map_err(|e| e.to_string())?.len() > 150_000_000 {
        return Err("Архив превышает 150 МБ".into());
    }
    // Hash and extract the same immutable bytes: the source ZIP may be changed by another app.
    let mut bytes = Vec::new();
    file.take(150_000_001)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() > 150_000_000 {
        return Err("Архив превышает 150 МБ".into());
    }
    let digest = format!("{:x}", Sha256::digest(&bytes));
    if !digest.eq_ignore_ascii_case(expected) {
        return Err(format!(
            "SHA-256 не совпадает. Установка отменена. Получен: {digest}"
        ));
    }
    let mut zip = zip::ZipArchive::new(std::io::Cursor::new(bytes)).map_err(|e| e.to_string())?;
    if zip.len() > 5000 {
        return Err("Слишком много файлов".into());
    }
    std::fs::create_dir_all(root).map_err(|e| e.to_string())?;
    let temp = root.join(format!(
        ".install-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    std::fs::create_dir(&temp).map_err(|e| e.to_string())?;
    let result = (|| {
        let mut total = 0u64;
        for index in 0..zip.len() {
            let entry = zip.by_index(index).map_err(|e| e.to_string())?;
            let enclosed = entry.enclosed_name().ok_or("Небезопасный путь в ZIP")?;
            // Reject Windows alternate streams/device names, symlinks and paths outside the root.
            let components: Vec<_> = enclosed.components().collect();
            if components.iter().any(|c| {
                let s = c.as_os_str().to_string_lossy();
                s.contains([':', '\\'])
                    || s.ends_with(['.', ' '])
                    || [
                        "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6",
                        "COM7", "COM8", "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6",
                        "LPT7", "LPT8", "LPT9",
                    ]
                    .contains(
                        &s.split('.')
                            .next()
                            .unwrap_or("")
                            .to_ascii_uppercase()
                            .as_str(),
                    )
            }) || entry.unix_mode().is_some_and(|m| m & 0o170000 == 0o120000)
            {
                return Err("Недопустимый путь или symlink в ZIP".into());
            }
            let relative = enclosed
                .strip_prefix(prefix)
                .map_err(|_| "Неверный каталог пакета")?;
            let output = temp.join(relative);
            total = total
                .checked_add(entry.size())
                .ok_or("Слишком большой ZIP")?;
            if total > 250_000_000 {
                return Err("Распакованный пакет превышает 250 МБ".into());
            }
            if entry.is_dir() {
                std::fs::create_dir_all(output).map_err(|e| e.to_string())?;
                continue;
            }
            if let Some(parent) = output.parent() {
                std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let mut file = std::fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(output)
                .map_err(|e| e.to_string())?;
            let declared = entry.size();
            let copied = std::io::copy(&mut entry.take(declared + 1), &mut file)
                .map_err(|e| e.to_string())?;
            if copied != declared {
                return Err("Размер файла не совпадает с ZIP manifest".into());
            }
            file.flush().map_err(|e| e.to_string())?;
        }
        match kind {
            "model" if !valid_model(&temp) => {
                return Err("Нет обязательных файлов русской модели 0.22".into())
            }
            "runtime"
                if ![
                    "libvosk.dll",
                    "libstdc++-6.dll",
                    "libgcc_s_seh-1.dll",
                    "libwinpthread-1.dll",
                ]
                .iter()
                .all(|p| temp.join(p).is_file()) =>
            {
                return Err("Неполный Vosk runtime".into())
            }
            "audio" => valid_audio(&temp)?,
            _ => {}
        }
        std::fs::write(temp.join("installed.sha256"), &digest).map_err(|e| e.to_string())?;
        let target = root.join(destination);
        let backup = temp.with_extension("previous");
        if target.exists() {
            std::fs::rename(&target, &backup)
                .map_err(|e| format!("Остановите SOL перед заменой пакета: {e}"))?;
        }
        if let Err(e) = std::fs::rename(&temp, &target) {
            if backup.exists() {
                let _ = std::fs::rename(&backup, &target);
            }
            return Err(e.to_string());
        }
        if backup.exists() {
            let _ = std::fs::remove_dir_all(backup);
        }
        Ok(format!("Пакет установлен. SHA-256: {digest}"))
    })();
    if temp.exists() {
        let _ = std::fs::remove_dir_all(temp);
    }
    result
}
