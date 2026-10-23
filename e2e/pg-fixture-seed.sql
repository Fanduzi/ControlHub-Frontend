-- input: psql -v ro_password=... -f e2e/pg-fixture-seed.sql as superuser inside the disposable PG container (scripts/e2e/pg-fixture-up.sh)
-- output: databases labdb/labdb_other, role ro_user (SELECT-only, per-run password), schemas/tables/data/grants required by e2e/query-workbench-pg.spec.ts
-- pos: deterministic reproduction of the verified local PG fixture (chub-pg-lab) — same objects, rows, and grants the 218-suite runs against; runs once per disposable container
-- note: if this file changes, update e2e/README.md; no secrets live here — the ro_user password arrives via the :ro_password psql variable

-- ── Role + databases (cluster scope) ──────────────────────────────────
DROP DATABASE IF EXISTS labdb;
DROP DATABASE IF EXISTS labdb_other;
DROP ROLE IF EXISTS ro_user;
CREATE ROLE ro_user LOGIN PASSWORD :'ro_password';
CREATE DATABASE labdb;
CREATE DATABASE labdb_other;

-- ── labdb: e2e + e2e_alt fixture objects ──────────────────────────────
\connect labdb

CREATE SCHEMA e2e;
CREATE SCHEMA e2e_alt;

CREATE TABLE e2e.parent (
    id bigint NOT NULL PRIMARY KEY,
    code text NOT NULL UNIQUE,
    label text NOT NULL
);
CREATE TABLE e2e.child (
    id bigint NOT NULL PRIMARY KEY,
    parent_id bigint NOT NULL REFERENCES e2e.parent (id) ON DELETE RESTRICT,
    child_name text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL
);
CREATE TABLE e2e.items (
    id bigint NOT NULL PRIMARY KEY,
    name text NOT NULL,
    price numeric(12,2) NOT NULL,
    big_payload text,
    secret_note text,
    blocked_note text,
    created_at timestamptz DEFAULT now() NOT NULL
);
CREATE TABLE e2e.paging (
    id integer,
    name text
);
CREATE TABLE e2e_alt.items (
    id bigint NOT NULL PRIMARY KEY,
    label text NOT NULL
);

INSERT INTO e2e.parent (id, code, label) VALUES
    (1, 'P_ALPHA', 'Alpha Parent'),
    (2, 'P_BETA', 'Beta Parent');
INSERT INTO e2e.child (id, parent_id, child_name, sort_order) VALUES
    (1, 1, 'child_a1', 1),
    (2, 1, 'child_a2', 2),
    (3, 2, 'child_b1', 1);
-- Row 1 carries the 9000-char truncation/long-value fixture; secret_note is
-- governed masked_no_copy; blocked_note deliberately has NO disclosure policy
-- (fail-closed blocked cell). Never extend these rows with real secrets.
INSERT INTO e2e.items (id, name, price, big_payload, secret_note, blocked_note, created_at) VALUES
    (1, 'alpha', 12.50, repeat('A', 9000), 'topsecret-alpha', 'hidden-alpha', '2024-01-01 00:00:00+00'),
    (2, 'beta', 99.99, repeat('B', 10), 'topsecret-beta', 'hidden-beta', '2024-01-02 00:00:00+00');
INSERT INTO e2e.paging (id, name)
SELECT g, 'item-' || g::text FROM generate_series(1, 60) g;
INSERT INTO e2e_alt.items (id, label) VALUES (1, 'ALT-SCHEMA-MARKER');

-- ro_user: SELECT-only, only the two fixture schemas (secret/nogranted-style
-- surfaces must stay absent — the spec proves unlisted scope is refused).
GRANT USAGE ON SCHEMA e2e TO ro_user;
GRANT USAGE ON SCHEMA e2e_alt TO ro_user;
GRANT SELECT ON ALL TABLES IN SCHEMA e2e TO ro_user;
GRANT SELECT ON ALL TABLES IN SCHEMA e2e_alt TO ro_user;

-- ── labdb_other: second-connection fixture objects ────────────────────
\connect labdb_other

CREATE SCHEMA e2e;
CREATE TABLE e2e.items (
    id bigint NOT NULL PRIMARY KEY,
    name text NOT NULL
);
CREATE TABLE public.only_in_other (id integer);
INSERT INTO e2e.items (id, name) VALUES (1, 'OTHER-DB-MARKER');
INSERT INTO public.only_in_other (id) VALUES (1);

GRANT USAGE ON SCHEMA e2e TO ro_user;
GRANT SELECT ON ALL TABLES IN SCHEMA e2e TO ro_user;
GRANT SELECT ON public.only_in_other TO ro_user;
