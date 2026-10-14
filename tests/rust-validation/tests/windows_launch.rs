#![cfg(windows)]
use assistent1_launch_validation_tests::{
    launch_types::{LaunchAction, LaunchOutcome},
    process_identity::{inspect, RunningState},
    windows_launch::execute,
};
use std::{
    path::{Path, PathBuf},
    sync::Mutex,
    time::{Duration, Instant},
};
// Cargo runs tests concurrently by default (including in CI). Every test intentionally uses
// same-name.exe to exercise file identity. Starting/stopping another test's same-named child
// would introduce genuinely uncertain candidates into an otherwise unrelated assertion.
static FIXTURE_TEST: Mutex<()> = Mutex::new(());

fn assert_state(target: &str, expected: RunningState) {
    let check = inspect(target);
    assert_eq!(check.state, expected, "EXE {target}: {check:#?}");
}
fn wait_state(target: &str, expected: RunningState) {
    let start = Instant::now();
    loop {
        let check = inspect(target);
        if check.state == expected {
            return;
        }
        assert!(
            start.elapsed() < Duration::from_secs(8),
            "Waiting for {expected:?}, EXE {target}: {check:#?}"
        );
        std::thread::sleep(Duration::from_millis(20));
    }
}
struct Fixture {
    dir: PathBuf,
    exe: PathBuf,
}
impl Fixture {
    fn new(mode: &str) -> Self {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!(
            "assistent1-validation-{}-{unique}",
            std::process::id()
        ));
        std::fs::create_dir(&dir).unwrap();
        let exe = dir.join("same-name.exe");
        std::fs::copy(env!("CARGO_BIN_EXE_launch-fixture"), &exe).unwrap();
        std::fs::write(dir.join("fixture.mode"), mode).unwrap();
        Self { dir, exe }
    }
    fn path(&self) -> &str {
        self.exe.to_str().unwrap()
    }
    fn wait_ready(&self) {
        wait_for(|| self.dir.join("fixture.ready").exists());
    }
    fn stop(&self) {
        std::fs::write(self.dir.join("fixture.stop"), "stop").unwrap();
        wait_for(|| self.dir.join("fixture.exited").exists());
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = std::fs::write(self.dir.join("fixture.stop"), "stop");
        if self.dir.join("fixture.ready").exists() {
            for _ in 0..400 {
                if self.dir.join("fixture.exited").exists() {
                    break;
                }
                std::thread::sleep(Duration::from_millis(20));
            }
            if !self.dir.join("fixture.exited").exists() {
                eprintln!(
                    "Cooperative fixture will time out; preserving stop file in {:?}",
                    self.dir
                );
                return;
            }
        }
        // Files may still be mapped by the cooperative child; no kill/TerminateProcess cleanup.
        for _ in 0..100 {
            if std::fs::remove_dir_all(&self.dir).is_ok() {
                break;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
    }
}
fn wait_for(condition: impl Fn() -> bool) {
    let start = Instant::now();
    while !condition() {
        assert!(
            start.elapsed() < Duration::from_secs(8),
            "Windows fixture timed out"
        );
        std::thread::sleep(Duration::from_millis(20));
    }
}
#[test]
fn real_closed_visible_and_same_name_other_directory() {
    let _serial = FIXTURE_TEST.lock().unwrap_or_else(|e| e.into_inner());
    let visible = Fixture::new("visible");
    let other = Fixture::new("visible");
    assert_state(visible.path(), RunningState::NotRunning);
    let started = execute(LaunchAction::Program {
        target: visible.path().into(),
        minimized: false,
        skip_if_running: true,
    })
    .unwrap();
    assert_eq!(started.outcome, LaunchOutcome::Launched, "{started:#?}");
    visible.wait_ready();
    wait_state(visible.path(), RunningState::AlreadyRunning);
    assert_state(other.path(), RunningState::NotRunning);
    let again = execute(LaunchAction::Program {
        target: visible.path().into(),
        minimized: false,
        skip_if_running: true,
    })
    .unwrap();
    assert_eq!(again.outcome, LaunchOutcome::AlreadyRunning, "{again:#?}");
    let case_and_separators = visible.path().replace('\\', "/").to_ascii_uppercase();
    assert_state(&case_and_separators, RunningState::AlreadyRunning);
    // A hard-link alias has a different name but the same volume/file identity.
    let alias = visible.dir.join("alias.exe");
    std::fs::hard_link(&visible.exe, &alias).unwrap();
    assert_state(alias.to_str().unwrap(), RunningState::AlreadyRunning);
    visible.stop();
    wait_state(visible.path(), RunningState::NotRunning);
    assert!(!Path::new(visible.path()).as_os_str().is_empty());
}
#[test]
fn real_background_process_is_not_a_usable_application_window() {
    let _serial = FIXTURE_TEST.lock().unwrap_or_else(|e| e.into_inner());
    let background = Fixture::new("background");
    let started = execute(LaunchAction::Program {
        target: background.path().into(),
        minimized: false,
        skip_if_running: true,
    })
    .unwrap();
    assert_eq!(started.outcome, LaunchOutcome::Launched, "{started:#?}");
    background.wait_ready();
    assert_state(background.path(), RunningState::BackgroundOnly);
    let again = execute(LaunchAction::Program {
        target: background.path().into(),
        minimized: false,
        skip_if_running: true,
    })
    .unwrap();
    assert_eq!(again.outcome, LaunchOutcome::StateUnknown, "{again:#?}");
    assert_eq!(again.details.window_count, Some(0), "{again:#?}");
    background.stop();
}
#[test]
fn real_startupinfo_minimized_launch_and_missing_exe_diagnostics() {
    let _serial = FIXTURE_TEST.lock().unwrap_or_else(|e| e.into_inner());
    let minimized = Fixture::new("visible");
    let result = execute(LaunchAction::Program {
        target: minimized.path().into(),
        minimized: true,
        skip_if_running: false,
    })
    .unwrap();
    assert_eq!(result.outcome, LaunchOutcome::Launched, "{result:#?}");
    minimized.wait_ready();
    let ready = std::fs::read_to_string(minimized.dir.join("fixture.ready")).unwrap();
    assert!(
        ready.ends_with(":true"),
        "Fixture honors STARTUPINFO: {ready}"
    );
    wait_state(minimized.path(), RunningState::AlreadyRunning);
    assert!(result.details.minimized_requested);
    assert_eq!(result.details.path.as_deref(), Some(minimized.path()));
    minimized.stop();
    let missing = minimized
        .dir
        .join("missing.exe")
        .to_str()
        .unwrap()
        .to_string();
    let error = execute(LaunchAction::Program {
        target: missing.clone(),
        minimized: false,
        skip_if_running: true,
    })
    .unwrap_err();
    assert_eq!(error.details.path.as_deref(), Some(missing.as_str()));
    assert!(error.details.windows_error.is_some());
}
