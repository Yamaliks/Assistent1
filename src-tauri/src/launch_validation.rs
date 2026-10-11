pub fn validate_url(target: &str) -> Result<String, String> {
    validate_text(target)?;
    let url = url::Url::parse(target).map_err(|_| "Некорректный URL".to_string())?;
    if !matches!(url.scheme(), "http" | "https")
        || !(target.to_ascii_lowercase().starts_with("http://")
            || target.to_ascii_lowercase().starts_with("https://"))
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err("Разрешены только HTTP(S)-адреса без логина и пароля".into());
    }
    Ok(url.to_string())
}

fn validate_text(target: &str) -> Result<(), String> {
    if target.is_empty() || target.len() > 4096 || target.chars().any(char::is_control) {
        return Err("Адрес пуст, слишком длинный или содержит управляющие символы".into());
    }
    Ok(())
}

pub fn validate_local_path(target: &str, program: bool) -> Result<(), String> {
    validate_text(target)?;
    let bytes = target.as_bytes();
    if bytes.len() < 3
        || !bytes[0].is_ascii_alphabetic()
        || bytes[1] != b':'
        || !matches!(bytes[2], b'\\' | b'/')
        || target[2..].contains([':', '<', '>', '"', '|', '?', '*'])
    {
        return Err(
            "Нужен полный локальный путь Windows. Сетевые и служебные пути запрещены".into(),
        );
    }
    for segment in target[3..].split(['\\', '/']) {
        let stem = segment.split('.').next().unwrap_or("").to_ascii_uppercase();
        let reserved = matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
            || (stem.len() == 4
                && (stem.starts_with("COM") || stem.starts_with("LPT"))
                && matches!(stem.as_bytes()[3], b'1'..=b'9'));
        if segment == ".." || segment.ends_with(['.', ' ']) || reserved {
            return Err("Путь содержит недопустимый сегмент или имя устройства".into());
        }
    }
    if program && !target.to_ascii_lowercase().ends_with(".exe") {
        return Err("Выберите EXE-файл без аргументов командной строки".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn http_urls_only() {
        for value in [
            "https://example.com/a?q=1",
            "http://localhost:8080",
            "https://пример.рф",
        ] {
            assert!(validate_url(value).is_ok(), "{value}");
        }
        for value in [
            "javascript:alert(1)",
            "file:///C:/app.exe",
            "https://user:pass@example.com",
            "https://",
            "https:example.com",
            "https://example.com\n",
            "ms-settings:display",
        ] {
            assert!(validate_url(value).is_err(), "{value}");
        }
    }
    #[test]
    fn exe_is_one_local_path_not_a_command_line() {
        assert!(validate_local_path(r"C:\Program Files\Мой App\App.EXE", true).is_ok());
        for value in [
            r"app.exe",
            r"C:app.exe",
            r"\\server\app.exe",
            r"\\?\C:\app.exe",
            r"C:\a.bat",
            r"C:\a.exe /c calc",
            r"C:\a.exe:stream.exe",
            r"C:\..\a.exe",
            r"C:\NUL.exe",
            "C:\\a.exe\0",
        ] {
            assert!(validate_local_path(value, true).is_err(), "{value}");
        }
    }
    #[test]
    fn folders_are_local_and_device_names_are_rejected() {
        assert!(validate_local_path(r"D:\Музыка", false).is_ok());
        assert!(validate_local_path(r"C:\", false).is_ok());
        for value in [
            r"\\server\share",
            r"C:\AUX",
            r"C:\COM1\test",
            r"C:\folder.\test",
            r"C:\folder \test",
        ] {
            assert!(validate_local_path(value, false).is_err());
        }
    }
}
