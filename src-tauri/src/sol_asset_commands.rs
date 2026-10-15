use crate::sol_assets::{install, valid_audio, AUDIO_IDS};
use serde::Serialize;
use std::path::{Path, PathBuf};
pub fn root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    use tauri::Manager;
    let installed = app
        .path()
        .resource_dir()
        .map_err(|e| e.to_string())?
        .join("sol");
    #[cfg(debug_assertions)]
    {
        let development = Path::new(env!("CARGO_MANIFEST_DIR")).join("resources/sol");
        if !installed.join("bundle-manifest.json").is_file()
            && development.join("bundle-manifest.json").is_file()
        {
            return Ok(development);
        }
    }
    Ok(installed)
}
fn user_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    use tauri::Manager;
    Ok(app
        .path()
        .app_local_data_dir()
        .map_err(|e| e.to_string())?
        .join("sol"))
}
fn audio_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let user = user_root(app)?.join("audio");
    if user.is_dir() {
        return Ok(user);
    }
    Ok(root(app)?.join("audio"))
}
#[derive(Serialize)]
pub struct AssetStatus {
    runtime: bool,
    model: bool,
    audio: bool,
    bundled: bool,
    error: Option<String>,
}
#[tauri::command]
pub async fn sol_asset_status(app: tauri::AppHandle) -> Result<AssetStatus, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let error = crate::bundled_assets::validate_trusted(&root(&app)?).err();
        let audio = valid_audio(&audio_root(&app)?).is_ok();
        Ok(AssetStatus {
            runtime: error.is_none(),
            model: error.is_none(),
            audio,
            bundled: true,
            error,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn sol_install(
    app: tauri::AppHandle,
    window: tauri::Window,
    kind: String,
    archive: String,
    sha256: String,
) -> Result<String, String> {
    if window.label() != "main" || kind != "audio" {
        return Err("Runtime и русская модель входят в установщик. Для восстановления переустановите Assistent1".into());
    }
    let root = user_root(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = crate::voice::installation_guard()?;
        install(&root, "audio", Path::new(&archive), &sha256)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn sol_audio(app: tauri::AppHandle, id: String) -> Result<Vec<u8>, String> {
    if !AUDIO_IDS.contains(&id.as_str()) {
        return Err("Неизвестная запись".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let path = audio_root(&app)?;
        valid_audio(&path)?;
        std::fs::read(path.join(format!("{id}.wav"))).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}
