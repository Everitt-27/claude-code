//! Apply database migrations and exit.
//!
//! The server migrates on startup too; this exists so migrations can be run as
//! a deliberate, separate step in a deployment or a Makefile target.

use anyhow::{Context, Result};
use ct_server::store::PostgresStore;

#[tokio::main]
async fn main() -> Result<()> {
    let url =
        std::env::var("DATABASE_URL").context("DATABASE_URL must be set to run migrations")?;
    let store = PostgresStore::connect(&url).await?;
    store.migrate().await?;
    println!("migrations applied");
    Ok(())
}
