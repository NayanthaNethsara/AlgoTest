use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::Duration;

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconId;
use tauri::AppHandle;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use super::state::AgentState;
use super::{scheduler, windows};

const STATUS_ITEM: &str = "status";
const OPEN_ITEM: &str = "open";
const DIAGNOSTICS_ITEM: &str = "diagnostics";
const SUPPORT_ITEM: &str = "support";
const STOP_ITEM: &str = "stop";

/// The tray is what makes "runs in the background" legible rather than alarming.
/// A contestant can see proctoring is on, read their support code, and stop it —
/// all without a hidden state anywhere.
pub fn install(app: &AppHandle, state: Arc<AgentState>) -> tauri::Result<()> {
    let status = MenuItem::with_id(app, STATUS_ITEM, state.status_label(), false, None::<&str>)?;
    let open = MenuItem::with_id(app, OPEN_ITEM, "Open contest window", true, None::<&str>)?;
    let diagnostics = MenuItem::with_id(app, DIAGNOSTICS_ITEM, "Diagnostics…", true, None::<&str>)?;
    let support = MenuItem::with_id(
        app,
        SUPPORT_ITEM,
        format!("Support code: {}", state.support_code()),
        true,
        None::<&str>,
    )?;
    let stop = MenuItem::with_id(app, STOP_ITEM, "Stop proctoring…", true, None::<&str>)?;

    let menu = Menu::with_items(
        app,
        &[
            &status,
            &PredefinedMenuItem::separator(app)?,
            &open,
            &diagnostics,
            &support,
            &PredefinedMenuItem::separator(app)?,
            &stop,
        ],
    )?;

    if let Some(tray) = app.tray_by_id(&TrayIconId::new("proctor")) {
        tray.set_menu(Some(menu))?;
        tray.set_tooltip(Some(state.status_label()))?;

        let handler_state = Arc::clone(&state);
        tray.on_menu_event(move |app, event| {
            handle_menu_event(app, &handler_state, event.id.as_ref());
        });
    } else {
        log::error!("tray icon 'proctor' is missing from tauri.conf.json");
    }

    spawn_status_refresher(app.clone(), state, status);
    Ok(())
}

fn handle_menu_event(app: &AppHandle, state: &Arc<AgentState>, id: &str) {
    match id {
        OPEN_ITEM => windows::open_contest_shell(state),
        DIAGNOSTICS_ITEM => windows::open_diagnostics(app),
        SUPPORT_ITEM => windows::open_diagnostics(app),
        STOP_ITEM => stop_proctoring(app, state),
        _ => {}
    }
}

/// Quitting is always allowed — it is a contestant's own machine — but never
/// silent: it locks scored submissions, so the client says so first.
fn stop_proctoring(app: &AppHandle, state: &Arc<AgentState>) {
    let state = Arc::clone(state);
    let app = app.clone();

    app.dialog()
        .message(
            "Proctoring will stop and you will not be able to submit solutions until you start it again.\n\n\
             Your work is not lost, and running code to test it keeps working.",
        )
        .title("Stop proctoring?")
        .buttons(MessageDialogButtons::OkCancelCustom(
            "Stop proctoring".to_string(),
            "Keep running".to_string(),
        ))
        .show(move |confirmed| {
            if !confirmed {
                return;
            }
            state.stopping.store(true, Ordering::Relaxed);
            scheduler::report_shutdown(&state, "contestant stopped proctoring from the tray");
            app.exit(0);
        });
}

fn spawn_status_refresher(app: AppHandle, state: Arc<AgentState>, status: MenuItem<tauri::Wry>) {
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_secs(5));
        if state.stopping.load(Ordering::Relaxed) {
            return;
        }

        let label = state.status_label();
        let _ = status.set_text(label);
        if let Some(tray) = app.tray_by_id(&TrayIconId::new("proctor")) {
            let detail = match state.seconds_since_ack() {
                Some(seconds) if state.healthy() => format!("{label} · last report {seconds}s ago"),
                Some(seconds) => format!("{label} · no report for {seconds}s"),
                None => format!("{label} · no report yet"),
            };
            let _ = tray.set_tooltip(Some(detail));
        }
    });
}