use serde::{Deserialize, Serialize};
#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum LaunchOutcome {
    Launched,
    AlreadyRunning,
    StateUnknown,
}
#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchDetails {
    pub path: Option<String>,
    pub canonical_path: Option<String>,
    pub inspection: Option<String>,
    pub pids: Vec<u32>,
    pub window_count: Option<usize>,
    pub windows_error: Option<u32>,
    pub minimized_requested: bool,
}
#[derive(Clone, Debug, Serialize)]
pub struct LaunchReport {
    pub outcome: LaunchOutcome,
    pub message: String,
    pub details: LaunchDetails,
}
#[derive(Clone, Debug, Serialize)]
pub struct LaunchFailure {
    pub message: String,
    pub details: LaunchDetails,
}
impl From<String> for LaunchFailure {
    fn from(message: String) -> Self {
        Self {
            message,
            details: LaunchDetails::default(),
        }
    }
}
impl From<&str> for LaunchFailure {
    fn from(message: &str) -> Self {
        message.to_owned().into()
    }
}
#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase", deny_unknown_fields)]
pub enum LaunchAction {
    Program {
        target: String,
        #[serde(default)]
        minimized: bool,
        #[serde(default)]
        skip_if_running: bool,
    },
    Browser {
        #[serde(default)]
        minimized: bool,
    },
    Website {
        target: String,
    },
    Folder {
        target: String,
    },
}
