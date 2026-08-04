//! Server entry point.

use anyhow::Result;
use ct_server::{build_app, Config};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

/// Ask the running server whether it is healthy, and exit 0 or 1.
///
/// Container health checks need *something* to run, and the runtime image has
/// no curl or wget in it. Rather than install one to make a single HTTP request,
/// the binary can make it itself.
async fn health_check() -> Result<()> {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    let bind = std::env::var("CT_BIND").unwrap_or_else(|_| "0.0.0.0:8787".into());
    let port = bind.rsplit(':').next().unwrap_or("8787");
    let address = format!("127.0.0.1:{port}");

    let mut stream = tokio::net::TcpStream::connect(&address).await?;
    stream
        .write_all(
            format!("GET /api/health HTTP/1.1\r\nHost: {address}\r\nConnection: close\r\n\r\n")
                .as_bytes(),
        )
        .await?;

    let mut response = String::new();
    stream.read_to_string(&mut response).await?;
    if response.starts_with("HTTP/1.1 200") {
        Ok(())
    } else {
        anyhow::bail!(
            "health check failed: {}",
            response.lines().next().unwrap_or("no response")
        )
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    if std::env::args().any(|arg| arg == "--health-check") {
        return health_check().await;
    }

    // Structured logging by default; set CT_LOG_FORMAT=json for machine-readable
    // output. The field names (town, branch, command, seq) are chosen to line up
    // with OpenTelemetry span attributes when tracing is added.
    let filter = EnvFilter::try_from_env("CT_LOG")
        .unwrap_or_else(|_| EnvFilter::new("info,ct_server=debug,tower_http=info"));
    let registry = tracing_subscriber::registry().with(filter);
    if std::env::var("CT_LOG_FORMAT").as_deref() == Ok("json") {
        registry
            .with(tracing_subscriber::fmt::layer().json())
            .init();
    } else {
        registry
            .with(tracing_subscriber::fmt::layer().with_target(false))
            .init();
    }

    let config = Config::from_env();
    let bind = config.bind.clone();
    let app = build_app(&config).await?;

    let listener = tokio::net::TcpListener::bind(&bind).await?;
    tracing::info!(address = %bind, "Corrigible Town server listening");
    axum::serve(listener, app).await?;
    Ok(())
}
