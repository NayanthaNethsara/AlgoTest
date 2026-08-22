fn main() {
    for key in [
        "MINIALGOTHON_SERVER_URL",
        "MINIALGOTHON_API_URL",
        "MINIALGOTHON_PORTAL_ORIGINS",
    ] {
        println!("cargo:rerun-if-env-changed={key}");
    }
    tauri_build::build()
}
