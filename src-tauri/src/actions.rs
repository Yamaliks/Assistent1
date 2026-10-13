pub use super::launch_types::{LaunchAction, LaunchFailure, LaunchReport};
#[tauri::command]
pub async fn execute_action(action: LaunchAction) -> Result<LaunchReport, LaunchFailure> {
    tauri::async_runtime::spawn_blocking(move || execute(action))
        .await
        .map_err(|e| LaunchFailure::from(format!("Ошибка обработки команды: {e}")))?
}
#[cfg(windows)]
fn execute(action: LaunchAction) -> Result<LaunchReport, LaunchFailure> {
    super::windows_launch::execute(action)
}
#[cfg(not(windows))]
fn execute(_action: LaunchAction) -> Result<LaunchReport, LaunchFailure> {
    Err("Запуск системных действий поддерживается только на Windows".into())
}
