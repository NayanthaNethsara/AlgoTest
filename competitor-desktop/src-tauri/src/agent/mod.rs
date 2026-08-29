pub mod commands;
pub mod identity;
pub mod lifecycle;
pub mod loopback;
pub mod scheduler;
pub mod state;
pub mod transport;
pub mod windows;

pub fn run() {
    crate::run();
}
