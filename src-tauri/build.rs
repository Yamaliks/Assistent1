#[path = "sol_bundle_build.rs"]
mod sol_bundle_build;
fn main() {
    sol_bundle_build::bind_manifest(
        &std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("resources/sol/bundle-manifest.json"),
    );
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "execute_action",
            "check_application_exe",
            "pick_application_exe",
            "prepare_mode_switch",
            "confirm_mode_switch",
            "sol_asset_status",
            "sol_install",
            "sol_audio",
            "sol_start",
            "sol_feed",
            "sol_stop",
            "pick_sol_archive",
        ]),
    ))
    .expect("Failed to build Tauri permissions and resources");
}
