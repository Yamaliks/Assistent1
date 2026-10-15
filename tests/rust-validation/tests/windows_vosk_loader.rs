#![cfg(windows)]
use assistent1_launch_validation_tests::vosk::load_runtime;

#[test]
fn loader_uses_an_absolute_windows_path_and_preserves_win32_failure_codes() {
    let root = std::env::temp_dir().join(format!("Assistent1 DLL test {}", std::process::id()));
    let directory = root.join("runtime");
    std::fs::create_dir_all(&directory).unwrap();
    let target = directory.join("libvosk.dll");
    // A real OS DLL tests the loader itself without pretending it is Vosk or a model.
    let system = std::path::PathBuf::from(std::env::var_os("SystemRoot").unwrap());
    std::fs::copy(system.join("System32").join("version.dll"), &target).unwrap();
    let module = load_runtime(&root).expect("real DLL in a directory containing spaces");
    unsafe {
        module
            .get::<unsafe extern "system" fn()>(b"GetFileVersionInfoSizeW\0")
            .unwrap();
    }
    drop(module);
    std::fs::write(&target, b"not a valid PE executable").unwrap();
    let error = match load_runtime(&root) {
        Ok(_) => panic!("Invalid PE must fail"),
        Err(error) => error,
    };
    assert!(
        error.contains("193"),
        "ERROR_BAD_EXE_FORMAT must be visible: {error}"
    );
    std::fs::remove_dir_all(root).unwrap();
}
