-- +goose Up
-- every row carries the rev of the write that last touched it, and is never
-- removed: a delete sets deleted = 1, so phones learn of it (technical-design.md
-- → sync). ids are text uuids, made wherever the row is created, phone or
-- server. a foreign key only proves the row exists; whether it is deleted is
-- the services' to check.

-- the one counter. each write transaction bumps it once and stamps its rows.
CREATE TABLE rev (
    id    INTEGER PRIMARY KEY CHECK (id = 1),
    value INTEGER NOT NULL
);
INSERT INTO rev (id, value) VALUES (1, 0);

-- a stretch of the store; position is its place on our path, ascending.
CREATE TABLE groups (
    id       TEXT    PRIMARY KEY NOT NULL,
    name     TEXT    NOT NULL,
    position INTEGER NOT NULL,
    rev      INTEGER NOT NULL,
    deleted  INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1))
);
CREATE INDEX groups_rev ON groups (rev);

-- no unique name: two phones may make the same item offline (technical-design.md
-- → duplicates). no group = Other.
CREATE TABLE items (
    id       TEXT    PRIMARY KEY NOT NULL,
    name     TEXT    NOT NULL,
    unit     TEXT    NOT NULL CHECK (unit IN ('g', 'count', 'none')),
    group_id TEXT    REFERENCES groups (id),
    rev      INTEGER NOT NULL,
    deleted  INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1))
);
CREATE INDEX items_rev ON items (rev);

CREATE TABLE meals (
    id      TEXT    PRIMARY KEY NOT NULL,
    name    TEXT    NOT NULL,
    rev     INTEGER NOT NULL,
    deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1))
);
CREATE INDEX meals_rev ON meals (rev);

-- amount is in the item's unit, whole grams or a whole count; none for `none`
-- items (decisions/0005).
CREATE TABLE ingredients (
    id      TEXT    PRIMARY KEY NOT NULL,
    meal_id TEXT    NOT NULL REFERENCES meals (id),
    item_id TEXT    NOT NULL REFERENCES items (id),
    amount  INTEGER CHECK (amount > 0),
    rev     INTEGER NOT NULL,
    deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1))
);
CREATE INDEX ingredients_rev ON ingredients (rev);
CREATE UNIQUE INDEX ingredients_meal_item ON ingredients (meal_id, item_id) WHERE deleted = 0;

-- date is the phone's local date, YYYY-MM-DD; position orders a slot's meals.
CREATE TABLE plan_entries (
    id       TEXT    PRIMARY KEY NOT NULL,
    date     TEXT    NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    slot     TEXT    NOT NULL CHECK (slot IN ('lunch', 'dinner')),
    meal_id  TEXT    NOT NULL REFERENCES meals (id),
    position INTEGER NOT NULL,
    rev      INTEGER NOT NULL,
    deleted  INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1))
);
CREATE INDEX plan_entries_rev ON plan_entries (rev);
CREATE INDEX plan_entries_date ON plan_entries (date, slot, position) WHERE deleted = 0;

-- one row per addition (spec → model). an entry with a plan entry is an
-- ingredient's mark: at most one per plan entry and item (decisions/0009).
CREATE TABLE list_entries (
    id            TEXT    PRIMARY KEY NOT NULL,
    item_id       TEXT    NOT NULL REFERENCES items (id),
    amount        INTEGER CHECK (amount > 0),
    plan_entry_id TEXT    REFERENCES plan_entries (id),
    state         TEXT    NOT NULL CHECK (state IN ('check', 'buy', 'bought')),
    rev           INTEGER NOT NULL,
    deleted       INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1))
);
CREATE INDEX list_entries_rev ON list_entries (rev);
CREATE UNIQUE INDEX list_entries_mark ON list_entries (plan_entry_id, item_id)
    WHERE plan_entry_id IS NOT NULL AND deleted = 0;

-- +goose Down
DROP TABLE list_entries;
DROP TABLE plan_entries;
DROP TABLE ingredients;
DROP TABLE meals;
DROP TABLE items;
DROP TABLE groups;
DROP TABLE rev;
