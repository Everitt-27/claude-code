# Corrigible Town as a single container.
#
# The result serves the API and the built web client from one origin on one
# port, which is what makes it usable from a phone: no CORS, no proxy, no second
# port to forward.

# --- 1. build the web client ------------------------------------------------
FROM node:22-slim AS web
WORKDIR /build

# The generated API schema is committed, so the web build does not need Rust.
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY packages/api-schema/package.json packages/api-schema/
COPY tests/browser/package.json tests/browser/
RUN npm ci --workspace @corrigible/web --include-workspace-root

COPY packages/api-schema packages/api-schema
COPY apps/web apps/web
RUN npm run build --workspace @corrigible/web

# --- 2. build the server ----------------------------------------------------
FROM rust:1-slim-bookworm AS server
WORKDIR /build
RUN apt-get update \
 && apt-get install -y --no-install-recommends pkg-config \
 && rm -rf /var/lib/apt/lists/*

COPY Cargo.toml Cargo.lock ./
COPY crates crates
COPY apps/server apps/server
# `sqlx::migrate!` embeds the migrations at compile time, so they have to be
# present here even though the runtime image does not need the directory.
COPY migrations migrations
RUN cargo build --release -p ct-server --bin ct-server --bin ct-seed

# --- 3. runtime -------------------------------------------------------------
FROM debian:bookworm-slim AS runtime
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --create-home --uid 10001 corrigible
WORKDIR /app

COPY --from=server /build/target/release/ct-server /usr/local/bin/ct-server
COPY --from=server /build/target/release/ct-seed /usr/local/bin/ct-seed
COPY --from=web /build/apps/web/dist /app/web
# Scenarios are read from disk at startup and validated before the server binds.
COPY scenarios /app/scenarios

USER corrigible
ENV CT_BIND=0.0.0.0:8787 \
    CT_SCENARIO_DIR=/app/scenarios \
    CT_STATIC_DIR=/app/web \
    CT_LOG=info

EXPOSE 8787

# `/api/health` is exempt from the access token precisely so this works.
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=5 \
  CMD ["/usr/local/bin/ct-server", "--health-check"]

CMD ["ct-server"]
