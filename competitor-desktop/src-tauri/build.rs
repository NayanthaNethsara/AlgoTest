fn main() {
    for key in [
        "ALGOTHON_SERVER_URL",
        "ALGOTHON_API_URL",
        "ALGOTHON_PORTAL_ORIGINS",
    ] {
        println!("cargo:rerun-if-env-changed={key}");
    }
    tauri_build::build()
}
