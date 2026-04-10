use std::net::SocketAddr;

use api_server::{app, init_tracing};
use tokio::net::TcpListener;

#[tokio::main]
async fn main() {
    init_tracing();

    let addr: SocketAddr = std::env::var("API_SERVER_ADDR")
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or_else(|| "127.0.0.1:3000".parse().unwrap());

    let listener = TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app()).await.unwrap();
}
