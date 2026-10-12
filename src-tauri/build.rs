fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "execute_action",
            "check_application_exe",
            "pick_application_exe",
        ]),
    ))
    .expect("Failed to build Tauri permissions and resources");
}
