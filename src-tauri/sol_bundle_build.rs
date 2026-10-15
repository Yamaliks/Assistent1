// Shared by the application and the native installer checker. Bind the resource inventory to PE code.
pub fn bind_manifest(manifest: &std::path::Path) {
    use sha2::{Digest, Sha256};
    println!("cargo:rerun-if-changed={}", manifest.display());
    if manifest.is_file() {
        let bytes = std::fs::read(manifest).expect("read staged SOL manifest");
        println!(
            "cargo:rustc-env=ASSISTENT1_SOL_MANIFEST_SHA256={:x}",
            Sha256::digest(bytes)
        );
    }
}
