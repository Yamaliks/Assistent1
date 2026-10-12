// Kept independent of Tauri so the same restore sequence can be tested on Linux.
pub trait WindowOperations {
    fn show(&self) -> Result<(), String>;
    fn unminimize(&self) -> Result<(), String>;
    fn focus(&self) -> Result<(), String>;
    fn hide(&self) -> Result<(), String>;
}

pub fn restore(window: &impl WindowOperations) -> Result<(), String> {
    // Make the existing HWND visible before restoring it and requesting foreground focus.
    window.show()?;
    window.unminimize()?;
    window.focus()
}

pub fn close_to_tray(window: &impl WindowOperations) -> Result<(), String> {
    // Never close/destroy the window: single-instance and tray events must reuse it.
    window.hide()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    #[derive(Default)]
    struct State {
        visible: bool,
        minimized: bool,
        focused: bool,
        fail_show: bool,
        calls: Vec<&'static str>,
    }
    struct Window(RefCell<State>);
    impl WindowOperations for Window {
        fn show(&self) -> Result<(), String> {
            let mut state = self.0.borrow_mut();
            state.calls.push("show");
            if state.fail_show {
                return Err("Window unavailable".into());
            }
            state.visible = true;
            Ok(())
        }
        fn unminimize(&self) -> Result<(), String> {
            let mut state = self.0.borrow_mut();
            assert!(state.visible, "Windows restore must follow show");
            state.calls.push("unminimize");
            state.minimized = false;
            Ok(())
        }
        fn focus(&self) -> Result<(), String> {
            let mut state = self.0.borrow_mut();
            assert!(state.visible && !state.minimized);
            state.calls.push("focus");
            state.focused = true;
            Ok(())
        }
        fn hide(&self) -> Result<(), String> {
            let mut state = self.0.borrow_mut();
            state.calls.push("hide");
            state.visible = false;
            state.focused = false;
            Ok(())
        }
    }
    #[test]
    fn close_then_reopen_reuses_the_window_repeatedly() {
        let window = Window(RefCell::new(State {
            visible: true,
            ..State::default()
        }));
        for _ in 0..3 {
            close_to_tray(&window).unwrap();
            assert!(!window.0.borrow().visible);
            restore(&window).unwrap();
            assert!(window.0.borrow().focused);
        }
        assert_eq!(
            window.0.borrow().calls,
            ["hide", "show", "unminimize", "focus"].repeat(3)
        );
    }
    #[test]
    fn minimized_hidden_window_restores_before_focus() {
        let window = Window(RefCell::new(State {
            minimized: true,
            ..State::default()
        }));
        restore(&window).unwrap();
        let state = window.0.borrow();
        assert!(state.visible && !state.minimized && state.focused);
    }
    #[test]
    fn failed_restore_does_not_attempt_to_focus_an_unavailable_window() {
        let window = Window(RefCell::new(State {
            fail_show: true,
            ..State::default()
        }));
        assert_eq!(restore(&window).unwrap_err(), "Window unavailable");
        assert_eq!(window.0.borrow().calls, ["show"]);
    }
}
