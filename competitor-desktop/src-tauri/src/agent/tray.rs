use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::Duration;

use tauri::image::Image;
use tauri::menu::{IsMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{TrayIconBuilder, TrayIconId};
use tauri::AppHandle;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use super::state::AgentState;
use super::{lifecycle, windows};

const STATUS_ITEM: &str = "status";
const OPEN_ITEM: &str = "open";
const DIAGNOSTICS_ITEM: &str = "diagnostics";
const SUPPORT_ITEM: &str = "support";
const SIGN_OUT_ITEM: &str = "sign-out";
const STOP_ITEM: &str = "stop";
const RESET_ITEM: &str = "reset";

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
    let sign_out = MenuItem::with_id(app, SIGN_OUT_ITEM, "Sign out…", true, None::<&str>)?;
    let stop = MenuItem::with_id(app, STOP_ITEM, "Stop proctoring and quit…", true, None::<&str>)?;
    let first_separator = PredefinedMenuItem::separator(app)?;
    let second_separator = PredefinedMenuItem::separator(app)?;

    let mut items: Vec<&dyn IsMenuItem<tauri::Wry>> = vec![
        &status,
        &first_separator,
        &open,
        &diagnostics,
        &support,
        &second_separator,
        &sign_out,
        &stop,
    ];

    // A developer needs a way to get back to a clean machine that does not involve
    // remembering which three JSON files and which login item to delete by hand.
    // It is not offered on a contestant's build: there, the honest exit is a stop
    // the server hears about.
    let reset = if cfg!(debug_assertions) {
        Some(MenuItem::with_id(
            app,
            RESET_ITEM,
            "Reset all client data and quit (dev)",
            true,
            None::<&str>,
        )?)
    } else {
        None
    };
    if let Some(reset) = &reset {
        items.push(reset);
    }

    let menu = Menu::with_items(app, &items)?;

    let handler_state = Arc::clone(&state);
    let icon_bytes = include_bytes!("../../icons/32x32.png");
    let icon = Image::from_bytes(icon_bytes)?;

    let _tray = TrayIconBuilder::with_id("proctor")
        .icon(icon)
        .menu(&menu)
        .tooltip(state.status_label())
        .on_menu_event(move |app, event| {
            handle_menu_event(app, &handler_state, event.id.as_ref());
        })
        .build(app)?;

    spawn_status_refresher(app.clone(), state, status);
    Ok(())
}

fn handle_menu_event(app: &AppHandle, state: &Arc<AgentState>, id: &str) {
    match id {
        OPEN_ITEM => windows::open_contest_shell(state),
        DIAGNOSTICS_ITEM => windows::open_diagnostics(app),
        SUPPORT_ITEM => windows::open_diagnostics(app),
        SIGN_OUT_ITEM => sign_out(app, state),
        STOP_ITEM => stop_proctoring(app, state),
        RESET_ITEM => reset_all_data(app, state),
        _ => {}
    }
}

/// Hands the machine back: proctoring stops, the enrollment is forgotten, and the
/// client closes completely. Signing in again means launching the app again, which
/// is what a contestant expects of a sign-out and is one fewer window to explain.
fn sign_out(app: &AppHandle, state: &Arc<AgentState>) {
    if !state.is_enrolled() {
        windows::open_setup(app);
        return;
    }

    let state = Arc::clone(state);
    let app = app.clone();

    confirm(
        &app,
        "Sign out?",
        "Proctoring stops, this machine is unenrolled, and the client closes.\n\n\
         Your submitted work is kept. Start the app again to sign in.",
        "Sign out",
        move |app| {
            // The unenrol talks to the server; doing it on the dialog's thread
            // would freeze the tray for as long as that takes.
            std::thread::spawn(move || {
                if let Err(err) =
                    lifecycle::sign_out_and_quit(&app, &state, "contestant signed out from the tray")
                {
                    log::warn!("sign-out could not clear the enrollment: {err}");
                }
            });
        },
    );
}

/// Quitting is always allowed — it is a contestant's own machine — but never
/// silent: it locks scored submissions, so the client says so first.
fn stop_proctoring(app: &AppHandle, state: &Arc<AgentState>) {
    let state = Arc::clone(state);
    let app = app.clone();

    confirm(
        &app,
        "Stop proctoring?",
        "Proctoring stops and the contest window closes. You will not be able to submit solutions \
         until you start the client again.\n\n\
         Your work is not lost, and running code to test it keeps working. This machine stays \
         enrolled, so starting the client again is all it takes.",
        "Stop proctoring",
        move |app| {
            std::thread::spawn(move || {
                lifecycle::stop_and_exit(&app, &state, "contestant stopped proctoring from the tray");
            });
        },
    );
}

fn reset_all_data(app: &AppHandle, state: &Arc<AgentState>) {
    let state = Arc::clone(state);
    let app = app.clone();

    confirm(
        &app,
        "Reset all client data?",
        "The server address, the enrollment, any buffered reports, and the autostart entry are all \
         deleted, and the client quits. The next launch starts from setup.",
        "Reset and quit",
        move |app| {
            std::thread::spawn(move || lifecycle::reset_and_quit(&app, &state));
        },
    );
}

/// Every destructive tray action asks first, in the same shape.
fn confirm(
    app: &AppHandle,
    title: &str,
    message: &str,
    confirm_label: &str,
    action: impl FnOnce(AppHandle) + Send + 'static,
) {
    let app_for_action = app.clone();
    app.dialog()
        .message(message)
        .title(title)
        .buttons(MessageDialogButtons::OkCancelCustom(
            confirm_label.to_string(),
            "Cancel".to_string(),
        ))
        .show(move |confirmed| {
            if confirmed {
                action(app_for_action);
            }
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