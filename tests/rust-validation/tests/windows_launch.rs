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

#[test]
fn real_mode_switch_keeps_shared_apps_and_only_posts_close_after_selection() {
    use assistent1_launch_validation_tests::mode_switch::{finish, prepare, Target};
    let _serial = FIXTURE_TEST.lock().unwrap_or_else(|e| e.into_inner());
    let app = Fixture::new("visible");
    let launched = execute(LaunchAction::Program {
        target: app.path().into(),
        minimized: false,
        skip_if_running: false,
    })
    .unwrap();
    assert_eq!(launched.outcome, LaunchOutcome::Launched, "{launched:#?}");
    app.wait_ready();
    wait_state(app.path(), RunningState::AlreadyRunning);
    let target = Target {
        id: "user-app".into(),
        name: "Cooperative test app".into(),
        path: app.path().into(),
    };
    let shared = prepare(vec![target.clone()], vec![target.clone()]).unwrap();
    assert!(shared.candidates.is_empty());
    finish(shared.token, vec![]).unwrap();
    assert_state(app.path(), RunningState::AlreadyRunning);
    let alias = app.dir.join("shared-alias.exe");
    std::fs::hard_link(&app.exe, &alias).unwrap();
    let alias_target = Target {
        id: "different-library-id".into(),
        name: "Alias".into(),
        path: alias.to_str().unwrap().into(),
    };
    let shared_alias = prepare(vec![target.clone()], vec![alias_target]).unwrap();
    assert!(
        shared_alias.candidates.is_empty(),
        "A confirmed same EXE with a different ID must not prompt for close"
    );
    finish(shared_alias.token, vec![]).unwrap();
    let repeated = execute(LaunchAction::Program {
        target: alias.to_str().unwrap().into(),
        minimized: true,
        skip_if_running: true,
    })
    .unwrap();
    assert_eq!(
        repeated.outcome,
        LaunchOutcome::AlreadyRunning,
        "Shared apps must not relaunch or minimize: {repeated:#?}"
    );
    let keep = prepare(vec![target.clone()], vec![]).unwrap();
    assert_eq!(keep.candidates.len(), 1);
    // Cancel/keep-all sends no WM_CLOSE at all, and invalid selection cannot close anything.
    assert!(finish(keep.token.clone(), vec!["not-in-previous-mode".into()]).is_err());
    finish(keep.token, vec![]).unwrap();
    assert_state(app.path(), RunningState::AlreadyRunning);
    let close = prepare(vec![target], vec![]).unwrap();
    let results = finish(close.token, vec!["user-app".into()]).unwrap();
    assert_eq!(results.len(), 1);
    assert!(
        !results[0].closed,
        "A surviving background process must not be reported as closed"
    );
    assert!(results[0].message.contains("процесс"));
    // WM_CLOSE destroyed the window; the cooperative process remains alive. No termination API.
    wait_state(app.path(), RunningState::BackgroundOnly);
    app.stop();
    wait_state(app.path(), RunningState::NotRunning);

    let ordinary = Fixture::new("close-exits");
    execute(LaunchAction::Program {
        target: ordinary.path().into(),
        minimized: false,
        skip_if_running: false,
    })
    .unwrap();
    ordinary.wait_ready();
    wait_state(ordinary.path(), RunningState::AlreadyRunning);
    let plan = prepare(
        vec![Target {
            id: "ordinary".into(),
            name: "Normal close fixture".into(),
            path: ordinary.path().into(),
        }],
        vec![],
    )
    .unwrap();
    let results = finish(plan.token, vec!["ordinary".into()]).unwrap();
    assert!(results[0].closed, "{}", results[0].message);
    wait_state(ordinary.path(), RunningState::NotRunning);
}
