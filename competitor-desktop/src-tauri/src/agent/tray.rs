use super::state::AgentState;
use super::{lifecycle, windows};
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::Duration;
use tauri::image::Image;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{TrayIconBuilder, TrayIconId};
use tauri::AppHandle;

pub fn install(app: &AppHandle, state: Arc<AgentState>) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open contestant portal", true, None::<&str>)?;
    let show = MenuItem::with_id(app, "show", "Show app", true, None::<&str>)?;
    let close = MenuItem::with_id(app, "close", "Sign out and close", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &show, &close])?;
    let handler_state = Arc::clone(&state);
    TrayIconBuilder::with_id("proctor")
        .icon(Image::from_bytes(include_bytes!("../../icons/32x32.png"))?)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip(state.status_label())
        .on_menu_event(move |app, event| match event.id.as_ref() {
            "open" => windows::open_contest_portal(&handler_state),
            "show" => windows::open_diagnostics(app),
            "close" => lifecycle::request_exit(app, &handler_state, "contestant closed from tray"),
            _ => {}
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
    let app = app.clone();
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_secs(5));
        if state.stopping.load(Ordering::Relaxed) {
            return;
        }
        if let Some(tray) = app.tray_by_id(&TrayIconId::new("proctor")) {
            let detail = format!(
                "{} · {} report(s) buffered",
                state.status_label(),
                state.buffer_len()
            );
            let _ = tray.set_tooltip(Some(detail));
        }
    });
    Ok(())
}
