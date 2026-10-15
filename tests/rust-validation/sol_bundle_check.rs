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
        let session = assistent1_launch_validation_tests::vosk::Session::new(
            root,
            16000,
            "installer-smoke".into(),
        )
        .expect("installed DLL dependencies and real Russian model must load offline");
        for _ in 0..8 {
            assert!(
                session
                    .feed(&vec![0; 4000])
                    .expect("real Vosk PCM path")
                    .is_none(),
                "Silence must not invent a command"
            );
        }
    }
    #[cfg(windows)]
    println!("Installed SOL validated: real Windows DLL/model load and silence PCM; not microphone recognition");
    #[cfg(not(windows))]
    println!("SOL inventory validated only; Windows DLL/model execution was not performed");
}
