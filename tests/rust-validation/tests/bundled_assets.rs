// Checks manifest/inventory behavior only; these fixture bytes are not a functioning Russian model.
use assistent1_launch_validation_tests::{
    bundled_assets::{validate, validate_trusted, MODEL_HASH},
    sol_assets::RUNTIME_HASH,
};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::path::PathBuf;
struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!(
            "assistent1-bundle-inventory-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir(&path).unwrap();
        let mut files = vec![];
        for name in [
            "runtime/libvosk.dll",
            "runtime/libgcc_s_seh-1.dll",
            "runtime/libstdc++-6.dll",
            "runtime/libwinpthread-1.dll",
            "model/am/final.mdl",
            "model/conf/mfcc.conf",
            "model/conf/model.conf",
            "model/graph/HCLr.fst",
            "model/graph/Gr.fst",
            "model/graph/phones/word_boundary.int",
            "licenses/MODEL-NOTICE.txt",
            "licenses/VOSK-APACHE-2.0.txt",
            "licenses/SOL-THIRD-PARTY.md",
            if cfg!(windows) {
                "tts/espeak-ng.exe"
            } else {
                "tts/espeak-ng"
            },
            "tts/espeak-ng-data/ru_dict",
            "tts/espeak-ng-data/lang/zle/ru",
            "tts/espeak-ng-data/phontab",
            "tts/espeak-ng-data/phonindex",
            "tts/espeak-ng-data/phondata",
            "tts/espeak-ng-data/intonations",
            "licenses/tts-source/espeak.zip",
            "licenses/tts-source/sonic.zip",
            "licenses/tts-source/COPYING-GPL-3.0.txt",
            "licenses/tts-source/BUILD-AND-LICENSE.md",
        ] {
            let file = path.join(name);
            std::fs::create_dir_all(file.parent().unwrap()).unwrap();
            std::fs::write(file, b"inventory fixture only").unwrap();
            files.push(json!({"path":name,"bytes":22,"sha256":format!("{:x}",Sha256::digest(b"inventory fixture only"))}));
        }
        let manifest = json!({"schema":1,"archives":{"runtime":{"name":"vosk-win64-0.3.45","sha256":RUNTIME_HASH,"bytes":14882445},"model":{"name":"vosk-model-small-ru-0.22","sha256":MODEL_HASH,"bytes":45000000},"tts":{"name":"espeak-ng-1.52.0","sha256":"b4517592e3cbc43703bb1c782702eafb98097659e0b7e96e69c32ee32ae5003a","bytes":19257724}},"files":files});
        std::fs::write(
            path.join("bundle-manifest.json"),
            serde_json::to_vec(&manifest).unwrap(),
        )
        .unwrap();
        Self(path)
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}
#[test]
fn unpacked_resource_corruption_and_missing_files_are_errors() {
    let fixture = Fixture::new();
    validate(&fixture.0).unwrap();
    std::fs::write(
        fixture.0.join("model/am/final.mdl"),
        b"inventory fixture evil",
    )
    .unwrap();
    assert!(validate(&fixture.0)
        .unwrap_err()
        .contains("SHA-256 model/am/final.mdl"));
    std::fs::remove_file(fixture.0.join("runtime/libvosk.dll")).unwrap();
    assert!(validate(&fixture.0).is_err());
}
#[test]
fn an_arbitrary_self_consistent_manifest_is_not_trusted_by_the_application() {
    let fixture = Fixture::new();
    validate(&fixture.0).unwrap();
    assert!(validate_trusted(&fixture.0).is_err());
}
