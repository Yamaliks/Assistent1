#![cfg_attr(windows, windows_subsystem = "windows")]
// Cooperative, short-lived Windows test application. Never touches another process/window.
#[cfg(not(windows))]
fn main() {}
#[cfg(windows)]
fn main() {
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, DestroyWindow, DispatchMessageW, IsIconic, PeekMessageW, ShowWindow,
        TranslateMessage, MSG, PM_REMOVE, SW_SHOW, WS_OVERLAPPEDWINDOW,
    };
    let mode = std::fs::read_to_string("fixture.mode").unwrap_or_else(|_| "visible".into());
    let mut window = std::ptr::null_mut();
    if mode.trim() != "background" {
        let class: Vec<u16> = "STATIC".encode_utf16().chain(Some(0)).collect();
        let title: Vec<u16> = "Assistent1 launch validation fixture"
            .encode_utf16()
            .chain(Some(0))
            .collect();
        window = unsafe {
            CreateWindowExW(
                0,
                class.as_ptr(),
                title.as_ptr(),
                WS_OVERLAPPEDWINDOW,
                100,
                100,
                400,
                300,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                std::ptr::null(),
            )
        };
        assert!(!window.is_null(), "Fixture window creation failed");
        unsafe {
            ShowWindow(window, SW_SHOW);
        }
    }
    let minimized = !window.is_null() && unsafe { IsIconic(window) } != 0;
    std::fs::write(
        "fixture.ready.tmp",
        format!("{}:{minimized}", std::process::id()),
    )
    .unwrap();
    // File existence is the readiness signal; do not expose a partially written PID/state.
    std::fs::rename("fixture.ready.tmp", "fixture.ready").unwrap();
    let started = std::time::Instant::now();
    while !std::path::Path::new("fixture.stop").exists()
        && started.elapsed() < std::time::Duration::from_secs(30)
    {
        let mut message: MSG = unsafe { std::mem::zeroed() };
        while unsafe { PeekMessageW(&mut message, std::ptr::null_mut(), 0, 0, PM_REMOVE) } != 0 {
            unsafe {
                TranslateMessage(&message);
                DispatchMessageW(&message);
            }
        }
        std::thread::sleep(std::time::Duration::from_millis(10));
    }
    if !window.is_null() {
        unsafe {
            DestroyWindow(window);
        }
    }
    std::fs::write("fixture.exited", "done").unwrap();
}
