use std::net::{SocketAddr, TcpStream};
use std::time::Duration;

pub fn check_internet_reachability() -> bool {
    let public_dns: SocketAddr = "1.1.1.1:53".parse().unwrap();
    TcpStream::connect_timeout(&public_dns, Duration::from_millis(300)).is_ok()
}
