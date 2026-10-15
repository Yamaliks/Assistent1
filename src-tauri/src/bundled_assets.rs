//! Validation of immutable, installer-owned SOL resources; user settings live elsewhere.
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::{
    collections::HashSet,
    io::Read,
    path::{Component, Path},
};
pub const MODEL_HASH: &str = "961d5ff98a17f4aa6de69864d0aa71fa5bac682301d2b5d17a3f24c5c99a46d4";
#[derive(Deserialize)]
struct Archive {
    name: String,
    sha256: String,
    bytes: u64,
}
#[derive(Deserialize)]
struct Archives {
    runtime: Archive,
    model: Archive,
    tts: Archive,
}
#[derive(Deserialize)]
struct Entry {
    path: String,
    bytes: u64,
    sha256: String,
}
#[derive(Deserialize)]
struct Manifest {
    schema: u32,
    archives: Archives,
    files: Vec<Entry>,
}
pub fn validate(root: &Path) -> Result<(), String> {
    let failure = |message: String| {
        format!("Ресурсы SOL отсутствуют или повреждены: {message}. Переустановите Assistent1 полным установщиком; настройки сохранятся.")
    };
    (|| {
        let manifest_path = root.join("bundle-manifest.json");
        if std::fs::metadata(&manifest_path)
            .map_err(|_| "Нет bundle-manifest.json")?
            .len()
            > 2_000_000
        {
            return Err("Слишком большой manifest".into());
        }
        let manifest: Manifest =
            serde_json::from_slice(&std::fs::read(manifest_path).map_err(|e| e.to_string())?)
                .map_err(|e| e.to_string())?;
        if manifest.schema != 1
            || manifest.archives.runtime.name != "vosk-win64-0.3.45"
            || manifest.archives.runtime.sha256 != crate::sol_assets::RUNTIME_HASH
            || manifest.archives.runtime.bytes != 14_882_445
            || manifest.archives.model.name != "vosk-model-small-ru-0.22"
            || manifest.archives.model.sha256 != MODEL_HASH
            || !(40_000_000..=55_000_000).contains(&manifest.archives.model.bytes)
            || manifest.archives.tts.name != "espeak-ng-1.52.0"
            || manifest.archives.tts.sha256
                != "b4517592e3cbc43703bb1c782702eafb98097659e0b7e96e69c32ee32ae5003a"
            || manifest.archives.tts.bytes != 19_257_724
        {
            return Err("Неверная версия/источник комплекта".into());
        }
        if manifest.files.len() > 5000 {
            return Err("Неверный список ресурсов".into());
        }
        let mut paths = HashSet::new();
        let mut total = 0u64;
        for entry in &manifest.files {
            let path = Path::new(&entry.path);
            if !path.components().all(|c| matches!(c, Component::Normal(_)))
                || entry.path.contains(['\\', ':'])
                || !["runtime/", "model/", "licenses/", "audio/", "tts/"]
                    .iter()
                    .any(|prefix| entry.path.starts_with(prefix))
                || !paths.insert(entry.path.as_str())
            {
                return Err("Некорректный путь в manifest".into());
            }
            total = total
                .checked_add(entry.bytes)
                .ok_or("Некорректный размер")?;
            if total > 350_000_000 {
                return Err("Слишком большой комплект".into());
            }
            let full = root.join(path);
            let meta = std::fs::symlink_metadata(&full)
                .map_err(|_| format!("Не найден {}", entry.path))?;
            if !meta.is_file() || meta.file_type().is_symlink() || meta.len() != entry.bytes {
                return Err(format!("Неверный размер/тип {}", entry.path));
            }
            let mut hash = Sha256::new();
            let mut file = std::fs::File::open(&full).map_err(|e| e.to_string())?;
            let mut buffer = [0u8; 65536];
            loop {
                let n = file.read(&mut buffer).map_err(|e| e.to_string())?;
                if n == 0 {
                    break;
                }
                hash.update(&buffer[..n]);
            }
            if format!("{:x}", hash.finalize()) != entry.sha256 {
                return Err(format!("SHA-256 {}", entry.path));
            }
        }
        for required in [
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
            if !paths.contains(required) {
                return Err(format!("Manifest не содержит {required}"));
            }
        }
        Ok(())
    })()
    .map_err(failure)
}

/// The checksum manifest itself must match the version embedded in the built executable.
pub fn validate_trusted(root: &Path) -> Result<(), String> {
    let expected = option_env!("ASSISTENT1_SOL_MANIFEST_SHA256").ok_or(
        "В этой сборке нет встроенного комплекта SOL. Установите полную Windows-версию Assistent1",
    )?;
    let path = root.join("bundle-manifest.json");
    let size = std::fs::metadata(&path)
        .map_err(|_| "Не найден manifest SOL. Переустановите Assistent1")?
        .len();
    if size > 2_000_000 {
        return Err("Повреждён manifest SOL".into());
    }
    let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
    if format!("{:x}", Sha256::digest(bytes)) != expected {
        return Err("Manifest SOL изменён или относится к другой версии. Переустановите Assistent1; пользовательские настройки сохранятся".into());
    }
    validate(root)
}
