#[path = "../../src-tauri/sol_bundle_build.rs"]
mod sol_bundle_build;
fn main() {
    sol_bundle_build::bind_manifest(
        &std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../src-tauri/resources/sol/bundle-manifest.json"),
    );
}
