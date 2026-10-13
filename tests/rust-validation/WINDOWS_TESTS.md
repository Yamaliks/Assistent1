# Native launch integration checks

On Windows 10/11 with a normal desktop and Rust installed:

```powershell
cargo test --locked --manifest-path tests/rust-validation/Cargo.toml --test windows_launch -- --test-threads=1
```

These tests launch a compiled, cooperative Win32 fixture and inspect real processes/windows. They cover closed/visible/background/minimized states, equal EXE names in different directories, hard-link identity, repeated requests, and missing EXE errors. No user applications are terminated; the fixture exits on its own stop file or after 30 seconds. These are separate from portable unit tests. Linux cross-compilation only builds them; it does not verify Windows runtime behavior.

Manual application checks: in Assistent1 run Steam, Discord, Telegram, a custom EXE and the default browser while fully closed, open, minimized and (when supported) in the tray. Compare the saved library ID, EXE and canonical path in “Подробнее”; record PID/window count/check reason. Test repeat-check both enabled and disabled, a changed library path and repeat mode launch. A tray/background-only process yields “Не удалось определить состояние”; manually disable repeat-check to ask the application's own single-instance mechanism to open it. Do not infer a responsive UI merely from a process. Third-party startup behavior may ignore minimizing.

A visible window is not a guarantee of a fully ready application. Hung/cloaked/tool/service windows do not prove a usable UI. UI hosted in a different helper EXE is not automatically attributed to the selected application.
