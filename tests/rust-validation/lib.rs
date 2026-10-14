#[path = "../../src-tauri/src/launch_validation.rs"]
pub mod launch_validation;
#[path = "../../src-tauri/src/window_lifecycle.rs"]
pub mod window_lifecycle;

#[path = "../../src-tauri/src/process_identity.rs"]
pub mod process_identity;

#[path = "../../src-tauri/src/launch_types.rs"]
pub mod launch_types;
#[cfg(windows)]
#[path = "../../src-tauri/src/windows_launch.rs"]
pub mod windows_launch;

#[path = "../../src-tauri/src/mode_switch.rs"]
pub mod mode_switch;
#[path = "../../src-tauri/src/sol_assets.rs"]
pub mod sol_assets;
