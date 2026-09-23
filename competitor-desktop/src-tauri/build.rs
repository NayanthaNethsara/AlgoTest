fn main() {
    for key in [
        "LABYRITHM_SERVER_URL",
        "LABYRITHM_API_URL",
        "LABYRITHM_PORTAL_ORIGINS",
    ] {
        println!("cargo:rerun-if-env-changed={key}");
    }
    tauri_build::build()
}
