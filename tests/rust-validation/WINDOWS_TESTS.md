# Native launch integration checks

On Windows 10/11 with a normal desktop and Rust installed:

```powershell
cargo test --locked --manifest-path tests/rust-validation/Cargo.toml --test windows_launch -- --nocapture
```

These tests launch a compiled, cooperative Win32 fixture and inspect real processes/windows. They cover closed/visible/background/minimized states, equal EXE names in different directories, hard-link identity, repeated requests, and missing EXE errors. No user applications are terminated; the fixture exits on its own stop file or after 30 seconds. These are separate from portable unit tests. Linux cross-compilation only builds them; it does not verify Windows runtime behavior.

The fixture tests serialize themselves even under Cargo's default parallel runner, as used by CI. They intentionally share an EXE basename: another test starting/exiting that basename could otherwise introduce an inaccessible/transient candidate and legitimately yield Unknown. Each test still exercises actual processes/windows and the same-name/different-directory check; no Unknown is accepted instead of the expected result. Readiness is published atomically after writing the PID/window state. Failing state assertions and waits for an inspected state include the full inspection/launch report (PID, window count, reason, Windows error); process-query uncertainty names the failing API/stage.

Run #38447613738's full log was inaccessible from the Linux development environment (GitHub API Forbidden). The source shows fixture interference and a production race that treated a confirmed exited process as uncertain. These are corrected, but their contribution to that specific run is not established without its detailed native diagnostics. If the tests still fail, retain the full assertion report rather than changing Unknown into success. In particular, a live inaccessible process or an unsupported file identity must remain Unknown. Windows runtime verification of this patch is still pending.

Manual application checks: in Assistent1 run Steam, Discord, Telegram, a custom EXE and the default browser while fully closed, open, minimized and (when supported) in the tray. Compare the saved library ID, EXE and canonical path in “Подробнее”; record PID/window count/check reason. Test repeat-check both enabled and disabled, a changed library path and repeat mode launch. A tray/background-only process yields “Не удалось определить состояние”; manually disable repeat-check to ask the application's own single-instance mechanism to open it. Do not infer a responsive UI merely from a process. Third-party startup behavior may ignore minimizing.

A visible window is not a guarantee of a fully ready application. Hung/cloaked/tool/service windows do not prove a usable UI. UI hosted in a different helper EXE is not automatically attributed to the selected application.

The mode-switch integration scenario also exercises keeping a shared application, cancelling/keeping all, rejecting an unrelated selection, posting WM_CLOSE to the confirmed fixture only, reporting a surviving background process as a failure, and a normal cooperative exit. These run under the same fixture mutex and do not call termination APIs. Voice/model/audio installation and the manual microphone checklist are in `docs/SOL.md`; native launch test compilation is not proof of microphone or recognition behavior.
