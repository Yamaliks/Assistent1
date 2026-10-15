// Run explicitly on the installed structure in Windows CI. Not a microphone/speech test.
fn main() {
    let path = std::env::args()
        .nth(1)
        .expect("usage: sol-bundle-check <installed sol directory>");
    let root = std::path::Path::new(&path);
    assistent1_launch_validation_tests::bundled_assets::validate_trusted(root)
        .expect("complete unpacked SOL inventory and checksums");
    #[cfg(windows)]
    {
        println!(
            "Installed SOL root: {} · checker architecture: {}",
            root.display(),
            std::env::consts::ARCH
        );
        for name in [
            "libvosk.dll",
            "libwinpthread-1.dll",
            "libgcc_s_seh-1.dll",
            "libstdc++-6.dll",
        ] {
            let path = root.join("runtime").join(name);
            let pe = std::fs::read(&path).expect("installed DLL bytes");
            let offset = u32::from_le_bytes(pe[0x3c..0x40].try_into().unwrap()) as usize;
            assert_eq!(&pe[offset..offset + 4], b"PE\0\0");
            let machine = u16::from_le_bytes(pe[offset + 4..offset + 6].try_into().unwrap());
            println!(
                "{} · {} bytes · PE machine 0x{machine:04x}",
                path.display(),
                pe.len()
            );
            assert_eq!(
                machine, 0x8664,
                "Vosk and every bundled dependency must be AMD64"
            );
        }
        // Diagnose the exact old loader call before anything preloads its dependencies.
        // Keep its Win32 source error (Display alone hides that code in libloading 0.7).
        match unsafe {
            libloading::os::windows::Library::load_with_flags(
                root.join("runtime/libvosk.dll"),
                0x100 | 0x1000,
            )
        } {
            Ok(old) => {
                println!(
                    "::notice title=Vosk legacy loader::Mixed-separator loader probe succeeded"
                );
                drop(old);
            }
            Err(error) => println!(
                "::notice title=Vosk legacy loader::Original LoadLibraryExW probe: {error:?}"
            ),
        }
        let session = assistent1_launch_validation_tests::vosk::Session::new(
            root,
            16000,
            "installer-smoke".into(),
        )
        .unwrap_or_else(|error| {
            println!("::error title=Installed Vosk loading failed::{error}");
            panic!("installed DLL dependencies and real Russian model must load offline: {error}");
        });
        for _ in 0..8 {
            assert!(
                session
                    .feed(&vec![0; 4000])
                    .expect("real Vosk PCM path")
                    .is_none(),
                "Silence must not invent a command"
            );
        }
        let audio = assistent1_launch_validation_tests::sol_tts::synthesize(root, "hello")
            .unwrap_or_else(|error| {
                println!("::error title=Installed Russian TTS failed::{error}");
                panic!("installed eSpeak NG must synthesize real Russian speech offline: {error}");
            });
        println!(
            "Installed Russian eSpeak NG produced {} bytes of non-silent PCM16 WAV",
            audio.len()
        );
        println!("::notice title=Installed SOL verified::Canonical Windows DLL load, real Russian model and non-silent Russian TTS passed offline");
    }
    #[cfg(windows)]
    println!("Installed SOL validated: real Windows DLL/model load and silence PCM; not microphone recognition");
    #[cfg(not(windows))]
    println!("SOL inventory validated only; Windows DLL/model execution was not performed");
}
