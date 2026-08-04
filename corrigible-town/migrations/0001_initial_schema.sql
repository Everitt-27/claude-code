-- Corrigible Town: append-only event storage plus the relational tables that
-- describe scenarios, towns and branches.
--
-- Two rules are enforced in the schema rather than in application code:
--   * events are immutable and contiguous within a branch;
--   * every event carries the metadata needed to explain itself.

CREATE TABLE IF NOT EXISTS scenarios (
    id                TEXT        NOT NULL,
    version           INTEGER     NOT NULL,
    ruleset_version   TEXT        NOT NULL,
    title             TEXT        NOT NULL,
    description       TEXT        NOT NULL,
    document          JSONB       NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id, version)
);

-- Local development identities. Deliberately minimal: enough to hang
-- authorisation off later without pretending the prototype has real auth.
CREATE TABLE IF NOT EXISTS identities (
    id           TEXT        PRIMARY KEY,
    display_name TEXT        NOT NULL,
    actor_id     TEXT        NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS towns (
    id                TEXT        PRIMARY KEY,
    name              TEXT        NOT NULL,
    scenario_id       TEXT        NOT NULL,
    scenario_version  INTEGER     NOT NULL,
    ruleset_version   TEXT        NOT NULL,
    seed              TEXT        NOT NULL,
    main_branch_id    TEXT        NOT NULL,
    owner_identity    TEXT        REFERENCES identities (id),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS branches (
    id                TEXT        PRIMARY KEY,
    town_id           TEXT        NOT NULL REFERENCES towns (id) ON DELETE CASCADE,
    label             TEXT        NOT NULL,
    parent_branch_id  TEXT        REFERENCES branches (id),
    -- Sequence number in the parent at which this branch forked.
    fork_seq          BIGINT      NOT NULL DEFAULT 0,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS branches_town_idx ON branches (town_id);

CREATE TABLE IF NOT EXISTS events (
    town_id          TEXT        NOT NULL,
    branch_id        TEXT        NOT NULL REFERENCES branches (id) ON DELETE CASCADE,
    seq              BIGINT      NOT NULL,
    tick             BIGINT      NOT NULL,
    event_id         TEXT        NOT NULL,
    event_type       TEXT        NOT NULL,
    payload          JSONB       NOT NULL,
    command_id       TEXT,
    command_seq      BIGINT,
    actor_id         TEXT        NOT NULL,
    institution_id   TEXT,
    authority_id     TEXT,
    causation_id     TEXT,
    causes           JSONB       NOT NULL DEFAULT '[]'::jsonb,
    correlation_id   TEXT        NOT NULL,
    ruleset_version  TEXT        NOT NULL,
    prev_hash        TEXT        NOT NULL,
    hash             TEXT        NOT NULL,
    significance     TEXT        NOT NULL,
    -- Operational auditing only. The simulation never reads this column, and
    -- it is excluded from the event hash by construction.
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (branch_id, seq)
);

CREATE INDEX IF NOT EXISTS events_town_idx ON events (town_id, branch_id, seq);
CREATE INDEX IF NOT EXISTS events_type_idx ON events (branch_id, event_type);
CREATE INDEX IF NOT EXISTS events_tick_idx ON events (branch_id, tick);
CREATE UNIQUE INDEX IF NOT EXISTS events_hash_idx ON events (branch_id, hash);

-- The append-only guarantee, enforced by the database rather than by hope.
CREATE OR REPLACE FUNCTION events_are_append_only() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'events are append-only: % on branch % seq % was refused',
        TG_OP, OLD.branch_id, OLD.seq;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS events_no_update ON events;
CREATE TRIGGER events_no_update
    BEFORE UPDATE OR DELETE ON events
    FOR EACH ROW EXECUTE FUNCTION events_are_append_only();

CREATE TABLE IF NOT EXISTS snapshots (
    branch_id     TEXT        NOT NULL REFERENCES branches (id) ON DELETE CASCADE,
    seq           BIGINT      NOT NULL,
    town_id       TEXT        NOT NULL,
    tick          BIGINT      NOT NULL,
    state_hash    TEXT        NOT NULL,
    document      JSONB       NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (branch_id, seq)
);

CREATE INDEX IF NOT EXISTS snapshots_latest_idx ON snapshots (branch_id, seq DESC);
