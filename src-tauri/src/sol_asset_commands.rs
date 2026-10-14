use crate::sol_assets::{install, status, valid_audio, AssetStatus, AUDIO_IDS};
use std::path::{Path, PathBuf};
pub fn root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    use tauri::Manager;
    Ok(app
        .path()
        .app_local_data_dir()
        .map_err(|e| e.to_string())?
        .join("sol"))
}
#[tauri::command]
pub fn sol_asset_status(app: tauri::AppHandle) -> Result<AssetStatus, String> {
    Ok(status(&root(&app)?))
}
#[tauri::command]
pub async fn sol_install(
    app: tauri::AppHandle,
    window: tauri::Window,
    kind: String,
    archive: String,
    sha256: String,
) -> Result<String, String> {
    if window.label() != "main" {
        return Err("Установка доступна в главном окне".into());
    }
    let root = root(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = crate::voice::installation_guard()?;
        install(&root, &kind, Path::new(&archive), &sha256)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub fn sol_audio(app: tauri::AppHandle, id: String) -> Result<Vec<u8>, String> {
    if !AUDIO_IDS.contains(&id.as_str()) {
        return Err("Неизвестная запись".into());
    }
    let path = root(&app)?.join("audio");
    valid_audio(&path)?;
    std::fs::read(path.join(format!("{id}.wav"))).map_err(|e| e.to_string())
}
