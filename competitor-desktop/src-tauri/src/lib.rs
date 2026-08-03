use std::process::{Child, Command};
use std::sync::Mutex;
use std::time::Duration;
use tauri::Manager;

struct NodeServer(Mutex<Option<Child>>);

impl Drop for NodeServer {
    fn drop(&mut self) {
        if let Some(mut child) = self.0.lock().unwrap().take() {
            let _ = child.kill();
        }
    }
}

fn find_server_dir(app: &tauri::App) -> Option<std::path::PathBuf> {
    // Check adjacent to the executable (inside .app/Contents/MacOS/server or Windows exe dir)
    if let Ok(exe) = std::env::current_exe() {
        let exe_dir = exe.parent()?;
        let server_dir = exe_dir.join("server").join("competitor-frontend");
        if server_dir.join("server.js").exists() {
            return Some(server_dir);
        }
    }

    // Fallback: resource directory
    if let Ok(resource_dir) = app.path().resource_dir() {
        let server_dir = resource_dir.join("server").join("competitor-frontend");
        if server_dir.join("server.js").exists() {
            return Some(server_dir);
        }
    }

    None
}

fn find_node_binary(server_dir: &std::path::Path) -> std::path::PathBuf {
    let node_name = if cfg!(target_os = "windows") {
        "node.exe"
    } else {
        "node"
    };

    // 1. Check bundled bin directory inside server
    let bundled_node = server_dir.join("bin").join(node_name);
    if bundled_node.exists() {
        return bundled_node;
    }

    // 2. Check parent server directory bin
    if let Some(parent) = server_dir.parent() {
        let parent_node = parent.join("bin").join(node_name);
        if parent_node.exists() {
            return parent_node;
        }
    }

    // 3. Fallback to system node
    std::path::PathBuf::from("node")
}

fn spawn_next_server(app: &tauri::App) -> Option<Child> {
    let server_dir = find_server_dir(app)?;
    let server_js = server_dir.join("server.js");
    let node_bin = find_node_binary(&server_dir);

    log::info!("Starting Next.js server with {:?} from {:?}", node_bin, server_js);

    let child = Command::new(&node_bin)
        .arg(&server_js)
        .current_dir(&server_dir)
        .env("PORT", "3000")
        .env("HOSTNAME", "127.0.0.1")
        .env("NODE_ENV", "production")
        .env(
            "NEXT_PUBLIC_API_URL",
            std::env::var("NEXT_PUBLIC_API_URL")
                .unwrap_or_else(|_| "http://localhost:8080".to_string()),
        )
        .spawn()
        .map_err(|e| log::error!("Failed to start Node server: {}", e))
        .ok()?;

    // Wait for server readiness
    std::thread::sleep(Duration::from_millis(2000));

    Some(child)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Spawn the Next.js standalone server in production
            if !cfg!(debug_assertions) {
                let child = spawn_next_server(app);
                app.manage(NodeServer(Mutex::new(child)));
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
