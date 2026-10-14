use crate::mode_switch::{CloseResult, Plan, Target};
#[tauri::command]
pub async fn prepare_mode_switch(
    window: tauri::Window,
    previous: Vec<Target>,
    next: Vec<Target>,
) -> Result<Plan, String> {
    if window.label() != "main" {
        return Err("Переключение выполняет главное окно".into());
    }
    #[cfg(windows)]
    {
        tauri::async_runtime::spawn_blocking(move || crate::mode_switch::prepare(previous, next))
            .await
            .map_err(|e| e.to_string())?
    }
    #[cfg(not(windows))]
    {
        let _ = (previous, next);
        Err("Переключение доступно в Windows".into())
    }
}
#[tauri::command]
pub async fn confirm_mode_switch(
    window: tauri::Window,
    token: String,
    selected: Vec<String>,
) -> Result<Vec<CloseResult>, String> {
    if window.label() != "main" {
        return Err("Подтверждение доступно в главном окне".into());
    }
    #[cfg(windows)]
    {
        tauri::async_runtime::spawn_blocking(move || crate::mode_switch::finish(token, selected))
            .await
            .map_err(|e| e.to_string())?
    }
    #[cfg(not(windows))]
    {
        let _ = (token, selected);
        Err("Закрытие доступно в Windows".into())
    }
}
