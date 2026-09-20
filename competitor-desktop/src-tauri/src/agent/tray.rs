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
    let open = MenuItem::with_id(app, OPEN_ITEM, "Open contest in browser", true, None::<&str>)?;
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
    let reset = MenuItem::with_id(app, RESET_ITEM, "Reset all client data and quit…", true, None::<&str>)?;
    let first_separator = PredefinedMenuItem::separator(app)?;
    let second_separator = PredefinedMenuItem::separator(app)?;

    let items: Vec<&dyn IsMenuItem<tauri::Wry>> = vec![
        &status,
        &first_separator,
        &open,
        &diagnostics,
        &support,
        &second_separator,
        &sign_out,
        &stop,
        &reset,
    ];

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
        .on_tray_icon_event(|tray, event| {
            if let tauri::tray::TrayIconEvent::Click {
                button: tauri::tray::MouseButton::Left,
                button_state: tauri::tray::MouseButtonState::Up,
                ..
            } = event
            {
                windows::open_diagnostics(tray.app_handle());
            }
        })
        .build(app)?;

    spawn_status_refresher(app.clone(), state, status);
    Ok(())
}

fn handle_menu_event(app: &AppHandle, state: &Arc<AgentState>, id: &str) {
    match id {
        OPEN_ITEM => windows::open_contest_portal(state),
        DIAGNOSTICS_ITEM => windows::open_diagnostics(app),
        SUPPORT_ITEM => windows::open_diagnostics(app),
        SIGN_OUT_ITEM => sign_out(app, state),
        STOP_ITEM => stop_proctoring(app, state),
        RESET_ITEM => reset_all_data(app, state),
        _ => {}
    }
}

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
            let buffered = state.buffer_len();
            let detail = if buffered > 0 {
                format!("{detail} · {buffered} report(s) buffered")
            } else {
                detail
            };
            let _ = tray.set_tooltip(Some(detail));
        }
    });
}
