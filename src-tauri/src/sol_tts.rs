//! Separate, installer-owned GPL eSpeak NG process. No shell, network or user arguments.
use std::{
    io::{Read, Write},
    path::Path,
    process::{Command, Stdio},
    time::{Duration, Instant},
};

pub fn phrase(id: &str) -> Result<&'static str, String> {
    Ok(match id {
        "hello" => "Привет! Сол на связи. Чем помочь?",
        "listening" => "Слушаю вас.",
        "opening" => "Открываю.",
        "mode" => "Начинаю переключение режима.",
        "done" => "Готово.",
        "errors" => "Не всё получилось. Посмотрите подробности в приложении.",
        "unknown" => "Не понял команду. Пожалуйста, повторите.",
        "cancelled" => "Действие отменено.",
        "goodbye" => "До встречи! Прослушивание остановлено.",
        _ => return Err("Неизвестный голосовой ответ".into()),
    })
}

pub fn synthesize(root: &Path, id: &str) -> Result<Vec<u8>, String> {
    let text = phrase(id)?;
    crate::bundled_assets::validate_trusted(root)?;
    let directory = root.join("tts").canonicalize().map_err(|e| e.to_string())?;
    let executable = directory.join(if cfg!(windows) {
        "espeak-ng.exe"
    } else {
        "espeak-ng"
    });
    let mut command = Command::new(executable);
    // Relative data path avoids passing non-ASCII Windows paths to the upstream C argv.
    command
        .current_dir(&directory)
        .args([
            "--path=.", "-v", "ru", "-s", "170", "-b", "1", "--stdout", "--stdin",
        ])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000); // CREATE_NO_WINDOW: only this short-lived TTS helper.
    }
    let mut child = command
        .spawn()
        .map_err(|e| format!("Не удалось запустить русский TTS: {e}"))?;
    let mut output = child.stdout.take().ok_or("Нет аудиовыхода TTS")?;
    let mut errors = child.stderr.take().ok_or("Нет диагностики TTS")?;
    std::thread::scope(|scope| {
        let audio = scope.spawn(move || {
            let mut b = Vec::new();
            output
                .by_ref()
                .take(4_000_001)
                .read_to_end(&mut b)
                .map(|_| b)
        });
        let diagnostics = scope.spawn(move || {
            let mut b = Vec::new();
            errors.by_ref().take(4096).read_to_end(&mut b).map(|_| b)
        });
        let result = (|| {
            child
                .stdin
                .take()
                .ok_or("Нет входа TTS")?
                .write_all(text.as_bytes())
                .map_err(|e| e.to_string())?;
            let deadline = Instant::now() + Duration::from_secs(15);
            loop {
                if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
                    return Ok(status);
                }
                if Instant::now() >= deadline {
                    return Err("Русский TTS не ответил за 15 секунд".to_string());
                }
                std::thread::sleep(Duration::from_millis(20));
            }
        })();
        if result.is_err() {
            let _ = child.kill();
            let _ = child.wait();
        } // Only our own helper; never user applications.
        let bytes = audio
            .join()
            .map_err(|_| "Ошибка аудиовыхода TTS")?
            .map_err(|e| e.to_string())?;
        let stderr = diagnostics
            .join()
            .map_err(|_| "Ошибка диагностики TTS")?
            .map_err(|e| e.to_string())?;
        let status = result?;
        if !status.success() {
            return Err(format!(
                "Русский TTS завершился с {status}: {}",
                String::from_utf8_lossy(&stderr)
            ));
        }
        normalize_wave(bytes)
    })
}

/// eSpeak's streaming stdout header uses placeholder lengths (it cannot seek a pipe).
/// Return an ordinary, finite PCM16 WAV suitable for Web Audio and installer verification.
pub fn normalize_wave(mut bytes: Vec<u8>) -> Result<Vec<u8>, String> {
    if bytes.len() < 46
        || bytes.len() > 4_000_000
        || bytes.len() % 2 != 0
        || &bytes[0..4] != b"RIFF"
        || &bytes[8..16] != b"WAVEfmt "
        || &bytes[16..24] != [16, 0, 0, 0, 1, 0, 1, 0]
        || &bytes[32..44] != [2, 0, 16, 0, b'd', b'a', b't', b'a', 0, 0xf0, 0xff, 0x7f]
        || !bytes[44..].iter().any(|b| *b != 0)
    {
        return Err("TTS не создал непустую речь PCM16 WAV".into());
    }
    let rate = u32::from_le_bytes(bytes[24..28].try_into().unwrap());
    if !(8000..=48000).contains(&rate) || bytes.len() - 44 > rate as usize * 2 * 15 {
        return Err("Некорректная длительность речи TTS".into());
    }
    let size = bytes.len() as u32;
    bytes[4..8].copy_from_slice(&(size - 8).to_le_bytes());
    bytes[40..44].copy_from_slice(&(size - 44).to_le_bytes());
    Ok(bytes)
}
