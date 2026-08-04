//! Server entry point.

use anyhow::Result;
use ct_server::{build_app, Config};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

#[tokio::main]
async fn main() -> Result<()> {
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
