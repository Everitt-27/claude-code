# Corrigible Town — development commands.
#
# Everything below works on a fresh checkout. The only hard prerequisites are a
# Rust toolchain and Node 20+; PostgreSQL is optional and the stack degrades to
# an in-memory store without it.

SHELL := /bin/bash
DATABASE_URL ?= postgres://corrigible:corrigible@127.0.0.1:5432/corrigible_town
SERVER_PORT ?= 8787

# `phone` deliberately defaults to the in-memory store. The whole point of that
# target is to get the app onto a handset in one command, and requiring Docker
# first defeats it. For a town that survives a restart, run `make db-up` and then
#   make phone PHONE_DATABASE_URL="$(DATABASE_URL)"
PHONE_DATABASE_URL ?=

.PHONY: help setup db-up db-down db-reset migrate seed dev dev-server dev-web \
        build schema fmt lint test test-rust test-browser test-all check clean \
        phone docker-build docker-up docker-down standalone

help: ## Show the available commands
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | \
	  awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

setup: ## Install frontend dependencies and generate the shared API schema
	npm install
	$(MAKE) schema

db-up: ## Start PostgreSQL in Docker
	docker compose up -d postgres
	@echo "waiting for postgres…"
	@until docker compose exec -T postgres pg_isready -U corrigible -d corrigible_town >/dev/null 2>&1; do sleep 1; done
	@echo "postgres ready on 5432"

db-down: ## Stop PostgreSQL
	docker compose down

db-reset: ## Destroy and recreate the database volume
	docker compose down -v
	$(MAKE) db-up

migrate: ## Apply database migrations (the server also does this on startup)
	DATABASE_URL=$(DATABASE_URL) cargo run --quiet -p ct-server --bin ct-migrate

seed: ## Create a town and run it to the point where hardship is detected
	DATABASE_URL=$(DATABASE_URL) cargo run --quiet -p ct-server --bin ct-seed

schema: ## Regenerate the TypeScript bindings from the Rust types
	TS_RS_EXPORT_DIR=$(PWD)/packages/api-schema/src/generated cargo test --workspace --lib --quiet
	node scripts/generate-api-schema.mjs

scenario: ## Regenerate the baseline scenario file from typed Rust
	cargo run --quiet -p ct-sim-core --bin ct-scenario-gen -- scenarios/factory-closure/factory-closure.json

dev: ## Run the whole development environment (server + web)
	@echo "server on :$(SERVER_PORT), web on :5173 — press Ctrl-C to stop both"
	@trap 'kill 0' EXIT INT TERM; \
	  ( DATABASE_URL=$(DATABASE_URL) CT_BIND=127.0.0.1:$(SERVER_PORT) cargo run -p ct-server --bin ct-server & ) ; \
	  sleep 2 ; \
	  npm run dev --workspace @corrigible/web ; \
	  wait

dev-server: ## Run only the API server
	DATABASE_URL=$(DATABASE_URL) CT_BIND=127.0.0.1:$(SERVER_PORT) cargo run -p ct-server --bin ct-server

dev-web: ## Run only the web client
	npm run dev --workspace @corrigible/web

phone: ## Serve the built client and API on one port, reachable from your phone
	@npm run build --workspace @corrigible/web
	@echo
	@echo "  Open this on your phone, on the same Wi-Fi:"
	@echo
	@for ip in $$(hostname -I 2>/dev/null || ipconfig getifaddr en0 2>/dev/null || true); do \
	  echo "      http://$$ip:$(SERVER_PORT)$${CT_ACCESS_TOKEN:+/?k=$$CT_ACCESS_TOKEN}"; \
	done
	@echo
	@if [ -z "$$CT_ACCESS_TOKEN" ]; then \
	  echo "  No CT_ACCESS_TOKEN set: anyone on this network can use it. Fine at home."; \
	  echo "  To require a secret:  CT_ACCESS_TOKEN=$$(openssl rand -hex 12) make phone"; \
	  echo; \
	fi
	@echo "  (the first run builds the server in release mode, which takes a few minutes)"
	@echo
	@CT_BIND=0.0.0.0:$(SERVER_PORT) \
	 CT_STATIC_DIR=apps/web/dist \
	 DATABASE_URL="$(PHONE_DATABASE_URL)" \
	 cargo run --release -p ct-server --bin ct-server

standalone: ## Build the whole app as one self-contained HTML file (wasm, no server)
	node scripts/build-standalone.mjs

docker-build: ## Build the single-container image
	docker compose --profile app build

docker-up: ## Run the whole thing in Docker (database + app on :8787)
	docker compose --profile app up -d
	@echo "http://localhost:8787"

docker-down: ## Stop the Docker stack
	docker compose --profile app down

build: ## Build everything in release mode
	cargo build --release --workspace
	npm run build

fmt: ## Format Rust sources
	cargo fmt --all

lint: ## Clippy plus a TypeScript typecheck
	cargo clippy --workspace --all-targets -- -D warnings
	npm run typecheck

test: test-rust ## Run the Rust test suite (unit, property, integration)

test-rust: ## Rust unit, property and integration tests
	cargo test --workspace

test-postgres: ## Server integration tests against a real PostgreSQL
	DATABASE_URL=$(DATABASE_URL) cargo test -p ct-server

test-browser: ## Playwright end-to-end tests (starts its own server and web app)
	npm run test:browser

test-all: test-rust test-browser ## Everything

check: fmt lint test-all ## Format, lint and test — what CI would run

clean: ## Remove build artefacts
	cargo clean
	rm -rf apps/web/dist node_modules tests/browser/test-results
