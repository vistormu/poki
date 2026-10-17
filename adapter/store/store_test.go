package store

import (
	"context"
	"errors"
	"path/filepath"
	"testing"

	"github.com/jmoiron/sqlx"
)

// testDB returns a fresh, migrated in-memory database, closed with the test.
// in a _test file on purpose: the binary must not import "testing".
func testDB(t *testing.T) *sqlx.DB {
	t.Helper()
	db, err := OpenMemory()
	if err != nil {
		t.Fatalf("OpenMemory: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	if _, err := Migrate(context.Background(), db); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	return db
}

func TestOpenSetsPragmas(t *testing.T) {
	db, err := Open(filepath.Join(t.TempDir(), "poki.db"))
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	defer db.Close()

	var journal string
	if err := db.Get(&journal, "PRAGMA journal_mode"); err != nil {
		t.Fatal(err)
	}
	if journal != "wal" {
		t.Errorf("journal_mode = %q, want wal", journal)
	}
	var timeout int
	if err := db.Get(&timeout, "PRAGMA busy_timeout"); err != nil {
		t.Fatal(err)
	}
	if timeout != 5000 {
		t.Errorf("busy_timeout = %d, want 5000", timeout)
	}
	if _, err := Migrate(context.Background(), db); err != nil {
		t.Fatalf("Migrate on a file: %v", err)
	}
	if err := New(db).write(context.Background(), func(*tx) error { return nil }); err != nil {
		t.Fatalf("an immediate write on a file: %v", err)
	}
}

func TestMigrateIsIdempotent(t *testing.T) {
	db := testDB(t)
	v1, err := Migrate(context.Background(), db)
	if err != nil {
		t.Fatalf("second Migrate: %v", err)
	}
	if v1 < 1 {
		t.Errorf("version = %d after migrating, want ≥ 1", v1)
	}
}

func TestTestDBsAreIsolated(t *testing.T) {
	a, b := testDB(t), testDB(t)
	if _, err := a.Exec("CREATE TABLE only_in_a (x)"); err != nil {
		t.Fatal(err)
	}
	var n int
	if err := b.Get(&n, "SELECT count(*) FROM sqlite_master WHERE name = 'only_in_a'"); err != nil {
		t.Fatal(err)
	}
	if n != 0 {
		t.Error("a table made in one test db shows up in another")
	}
}

func TestEveryTableIsSynced(t *testing.T) {
	db := testDB(t)
	var names []string
	if err := db.Select(&names, `SELECT name FROM sqlite_master WHERE type = 'table'
		AND name NOT IN ('rev', 'goose_db_version') AND name NOT LIKE 'sqlite_%'`); err != nil {
		t.Fatal(err)
	}
	if len(names) != len(tables) {
		t.Errorf("tables in the db %v, in tables %d", names, len(tables))
	}
	for _, name := range names {
		if !tables[name] {
			t.Errorf("table %s is not in tables", name)
			continue
		}
		var cols []struct {
			Name    string `db:"name"`
			Type    string `db:"type"`
			NotNull bool   `db:"notnull"`
		}
		if err := db.Select(&cols, `SELECT name, type, "notnull" FROM pragma_table_info(?)`, name); err != nil {
			t.Fatal(err)
		}
		has := map[string]bool{}
		for _, c := range cols {
			has[c.Name+" "+c.Type] = c.NotNull
		}
		for _, want := range []string{"id TEXT", "rev INTEGER", "deleted INTEGER"} {
			if !has[want] {
				t.Errorf("%s lacks a not-null %s", name, want)
			}
		}
	}
}

func TestWriteBumpsRev(t *testing.T) {
	ctx := context.Background()
	s := New(testDB(t))
	base, err := s.Rev(ctx) // the migrations' own writes (no meal) come first
	if err != nil {
		t.Fatal(err)
	}

	var stamped int64
	err = s.write(ctx, func(t *tx) error {
		stamped = t.rev
		_, err := t.ExecContext(ctx, `INSERT INTO meals (id, name, rev) VALUES ('m1', 'lasagna', ?)`, t.rev)
		return err
	})
	if err != nil {
		t.Fatal(err)
	}
	if rev, _ := s.Rev(ctx); rev != base+1 || stamped != base+1 {
		t.Errorf("after one write rev = %d, stamped %d; want %d", rev, stamped, base+1)
	}

	// a failed write leaves neither its rows nor its rev
	boom := errors.New("boom")
	err = s.write(ctx, func(t *tx) error {
		if _, err := t.ExecContext(ctx, `INSERT INTO meals (id, name, rev) VALUES ('m2', 'soup', ?)`, t.rev); err != nil {
			return err
		}
		return boom
	})
	if !errors.Is(err, boom) {
		t.Fatalf("err = %v, want boom", err)
	}
	var n int
	if err := s.db.Get(&n, `SELECT count(*) FROM meals WHERE id LIKE 'm_'`); err != nil {
		t.Fatal(err)
	}
	if rev, _ := s.Rev(ctx); rev != base+1 || n != 1 {
		t.Errorf("after a failed write rev = %d, meals %d; want %d, 1", rev, n, base+1)
	}
}

func TestDelIsATombstone(t *testing.T) {
	ctx := context.Background()
	s := New(testDB(t))
	if err := s.write(ctx, func(t *tx) error {
		_, err := t.ExecContext(ctx, `INSERT INTO meals (id, name, rev) VALUES ('m1', 'lasagna', ?)`, t.rev)
		return err
	}); err != nil {
		t.Fatal(err)
	}
	created, _ := s.Rev(ctx)
	del := func() error {
		return s.write(ctx, func(t *tx) error { return t.del(ctx, "meals", "m1") })
	}
	if err := del(); err != nil {
		t.Fatal(err)
	}
	var row struct {
		Rev     int64 `db:"rev"`
		Deleted bool  `db:"deleted"`
	}
	if err := s.db.Get(&row, `SELECT rev, deleted FROM meals WHERE id = 'm1'`); err != nil {
		t.Fatalf("the deleted row is gone: %v", err)
	}
	if !row.Deleted || row.Rev != created+1 {
		t.Errorf("deleted row = %+v, want deleted at rev %d", row, created+1)
	}

	// deleting again keeps the first tombstone's rev
	if err := del(); err != nil {
		t.Fatal(err)
	}
	if err := s.db.Get(&row, `SELECT rev, deleted FROM meals WHERE id = 'm1'`); err != nil {
		t.Fatal(err)
	}
	if row.Rev != created+1 {
		t.Errorf("rev = %d after a second delete, want %d", row.Rev, created+1)
	}

	if err := s.write(ctx, func(t *tx) error { return t.del(ctx, "meals; DROP TABLE meals", "m1") }); err == nil {
		t.Error("del took an unknown table")
	}
}

func TestSchemaHolds(t *testing.T) {
	db := testDB(t)
	seed := `
		INSERT INTO groups (id, name, position, rev) VALUES ('g1', 'dairy', 1, 1);
		INSERT INTO items (id, name, unit, group_id, rev) VALUES ('i1', 'mozzarella', 'g', 'g1', 1);
		INSERT INTO meals (id, name, rev) VALUES ('m1', 'lasagna', 1);
		INSERT INTO ingredients (id, meal_id, item_id, amount, rev) VALUES ('n1', 'm1', 'i1', 200, 1);
		INSERT INTO plan_entries (id, date, slot, meal_id, position, rev) VALUES ('p1', '2026-10-17', 'dinner', 'm1', 1, 1);
		INSERT INTO list_entries (id, item_id, amount, plan_entry_id, state, rev) VALUES ('l1', 'i1', 200, 'p1', 'buy', 1);`
	if _, err := db.Exec(seed); err != nil {
		t.Fatalf("seed: %v", err)
	}

	tests := []struct {
		name, sql string
		ok        bool
	}{
		{"unit outside g, count, none", `INSERT INTO items (id, name, unit, rev) VALUES ('i2', 'milk', 'ml', 1)`, false},
		{"an item with no group", `INSERT INTO items (id, name, unit, rev) VALUES ('i2', 'salt', 'none', 1)`, true},
		{"an item in a missing group", `INSERT INTO items (id, name, unit, group_id, rev) VALUES ('i2', 'salt', 'none', 'gx', 1)`, false},
		{"a zero amount", `INSERT INTO list_entries (id, item_id, amount, state, rev) VALUES ('l2', 'i1', 0, 'buy', 1)`, false},
		{"a fractional amount", `INSERT INTO list_entries (id, item_id, amount, state, rev) VALUES ('l2', 'i1', 0.5, 'buy', 1)`, true},
		{"a list entry with no amount", `INSERT INTO list_entries (id, item_id, state, rev) VALUES ('l2', 'i1', 'buy', 1)`, true},
		{"a state outside check, buy, bought", `INSERT INTO list_entries (id, item_id, state, rev) VALUES ('l2', 'i1', 'have', 1)`, false},
		{"the same item twice in a meal", `INSERT INTO ingredients (id, meal_id, item_id, rev) VALUES ('n2', 'm1', 'i1', 1)`, false},
		{"the same item again after its ingredient went", `UPDATE ingredients SET deleted = 1 WHERE id = 'n1';
			INSERT INTO ingredients (id, meal_id, item_id, rev) VALUES ('n2', 'm1', 'i1', 1)`, true},
		{"two marks of one item on one plan entry", `INSERT INTO list_entries (id, item_id, plan_entry_id, state, rev) VALUES ('l2', 'i1', 'p1', 'check', 1)`, false},
		{"one item added twice by hand", `INSERT INTO list_entries (id, item_id, state, rev) VALUES ('l2', 'i1', 'buy', 1);
			INSERT INTO list_entries (id, item_id, state, rev) VALUES ('l3', 'i1', 'buy', 1)`, true},
		{"a slot outside lunch, dinner", `INSERT INTO plan_entries (id, date, slot, meal_id, position, rev) VALUES ('p2', '2026-10-17', 'brunch', 'm1', 1, 1)`, false},
		{"a date not YYYY-MM-DD", `INSERT INTO plan_entries (id, date, slot, meal_id, position, rev) VALUES ('p2', '17/10/2026', 'lunch', 'm1', 1, 1)`, false},
		{"deleted outside 0, 1", `UPDATE meals SET deleted = 2`, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tx, err := db.Beginx()
			if err != nil {
				t.Fatal(err)
			}
			defer tx.Rollback()
			_, err = tx.Exec(tt.sql)
			if tt.ok && err != nil {
				t.Errorf("refused: %v", err)
			}
			if !tt.ok && err == nil {
				t.Error("allowed")
			}
		})
	}
}
