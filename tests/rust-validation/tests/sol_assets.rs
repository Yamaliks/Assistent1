use assistent1_launch_validation_tests::sol_assets::{install, valid_audio, AUDIO_IDS};
use sha2::{Digest, Sha256};
use std::{io::Write, path::PathBuf};
struct Temp(PathBuf);
impl Temp {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!(
            "assistent1-assets-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir(&path).unwrap();
        Self(path)
    }
}
impl Drop for Temp {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}
fn archive(temp: &Temp, files: &[(&str, &[u8])]) -> (PathBuf, String) {
    let path = temp.0.join("input.zip");
    let mut writer = zip::ZipWriter::new(std::fs::File::create(&path).unwrap());
    for (name, data) in files {
        writer
            .start_file(*name, zip::write::SimpleFileOptions::default())
            .unwrap();
        writer.write_all(data).unwrap();
    }
    writer.finish().unwrap();
    let digest = format!("{:x}", Sha256::digest(std::fs::read(&path).unwrap()));
    (path, digest)
}
#[test]
fn checksum_and_zip_traversal_cannot_replace_existing_user_assets() {
    let temp = Temp::new();
    let root = temp.0.join("sol");
    std::fs::create_dir_all(root.join("model")).unwrap();
    std::fs::write(root.join("model/user-marker"), "keep").unwrap();
    let (zip, hash) = archive(&temp, &[("../escape.txt", b"bad")]);
    assert!(install(&root, "model", &zip, &"0".repeat(64))
        .unwrap_err()
        .contains("SHA-256"));
    assert!(install(&root, "model", &zip, &hash).is_err());
    assert_eq!(
        std::fs::read_to_string(root.join("model/user-marker")).unwrap(),
        "keep"
    );
    assert!(!temp.0.join("escape.txt").exists());
    let (zip, hash) = archive(&temp, &[("vosk-model-small-ru-0.22/COM2.txt", b"bad")]);
    assert!(install(&root, "model", &zip, &hash).is_err());
}
#[test]
fn incomplete_model_and_invalid_audio_are_not_reported_as_installed() {
    let temp = Temp::new();
    let root = temp.0.join("sol");
    let (zip, hash) = archive(
        &temp,
        &[(
            "vosk-model-small-ru-0.22/am/final.mdl",
            b"not a model; installer fixture only",
        )],
    );
    assert!(install(&root, "model", &zip, &hash).is_err());
    assert!(!root.join("model").exists());
    assert!(valid_audio(&temp.0).is_err());
    std::fs::write(
        temp.0.join("manifest.json"),
        r#"{"author":"test-only","license":"test fixture"}"#,
    )
    .unwrap();
    for id in AUDIO_IDS {
        std::fs::write(temp.0.join(format!("{id}.wav")), b"RIFF\0\0\0\0WAVE").unwrap();
    }
    assert!(valid_audio(&temp.0).is_err()); // Header/silence placeholders are not voice recordings.
}
