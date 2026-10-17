// Package store is the sqlite adapter: connection, migrations and queries.
package store

import (
	"context"
	"database/sql"
	"embed"
	"fmt"
	"io/fs"
	"net/url"
	"sync/atomic"

	"github.com/jmoiron/sqlx"
	"github.com/pressly/goose/v3"
	_ "modernc.org/sqlite" // pure go: no cgo, a static binary
)

// Store implements the service store interfaces against sqlite.
type Store struct {
	db *sqlx.DB
}

func New(db *sqlx.DB) *Store {
	return &Store{db: db}
}

//go:embed migrations/*.sql
var migrations embed.FS

// pragmas are not optional: wal lets reads run during the one write,
// busy_timeout makes a second writer wait instead of failing, and foreign keys
// are off in sqlite unless asked for.
var pragmas = []string{"foreign_keys(1)", "journal_mode(WAL)", "busy_timeout(5000)"}

// Open opens the database file at path, creating it if needed. transactions
// take the write lock when they begin (_txlock=immediate): every write bumps
// rev first, and a read lock upgraded later can fail where waiting would not.
func Open(path string) (*sqlx.DB, error) {
	q := url.Values{"_pragma": pragmas, "_txlock": {"immediate"}}
	db, err := open("file:" + path + "?" + q.Encode())
	if err != nil {
		return nil, fmt.Errorf("open %s: %w", path, err)
	}
	return db, nil
}

var memN atomic.Int64

// OpenMemory opens a fresh, empty in-memory database, for tests. it has one
// connection: each new connection to an in-memory db is a different, empty db.
func OpenMemory() (*sqlx.DB, error) {
	db, err := open(fmt.Sprintf("file:mem%d?mode=memory&_pragma=foreign_keys(1)", memN.Add(1)))
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	return db, nil
}

func open(dsn string) (*sqlx.DB, error) {
	raw, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	// sqlx knows the dialect as "sqlite3": ? placeholders, named queries
	db := sqlx.NewDb(raw, "sqlite3")
	if err := check(db); err != nil {
		db.Close()
		return nil, err
	}
	return db, nil
}

// check fails on a connection where the pragmas did not take: they default off
// silently.
func check(db *sqlx.DB) error {
	var fk int
	if err := db.Get(&fk, "PRAGMA foreign_keys"); err != nil {
		return err
	}
	if fk != 1 {
		return fmt.Errorf("sqlite: foreign keys are off")
	}
	var journal string
	if err := db.Get(&journal, "PRAGMA journal_mode"); err != nil {
		return err
	}
	if journal != "wal" && journal != "memory" {
		return fmt.Errorf("sqlite: journal mode is %q, not wal", journal)
	}
	return nil
}

// Migrate applies every pending migration and returns the resulting version.
func Migrate(ctx context.Context, db *sqlx.DB) (int64, error) {
	fsys, err := fs.Sub(migrations, "migrations")
	if err != nil {
		return 0, err
	}
	p, err := goose.NewProvider(goose.DialectSQLite3, db.DB, fsys)
	if err != nil {
		return 0, err
	}
	if _, err := p.Up(ctx); err != nil {
		return 0, err
	}
	return p.GetDBVersion(ctx)
}

// Rev is the rev of the last write: every row with a higher one is news.
func (s *Store) Rev(ctx context.Context) (int64, error) {
	var rev int64
	err := s.db.GetContext(ctx, &rev, `SELECT value FROM rev`)
	return rev, err
}

// tx is one write: every row it touches is stamped with its rev.
type tx struct {
	*sqlx.Tx
	rev int64
}

// write runs fn in a transaction that first bumps rev, and commits if fn
// returns nil. every write goes through here, so no row changes unseen.
func (s *Store) write(ctx context.Context, fn func(*tx) error) error {
	sqlTx, err := s.db.BeginTxx(ctx, nil)
	if err != nil {
		return err
	}
	defer sqlTx.Rollback()
	t := &tx{Tx: sqlTx}
	if err := sqlTx.GetContext(ctx, &t.rev, `UPDATE rev SET value = value + 1 RETURNING value`); err != nil {
		return fmt.Errorf("bump rev: %w", err)
	}
	if err := fn(t); err != nil {
		return err
	}
	return sqlTx.Commit()
}

// tables are the synced tables; a table name is only ever one of these, never
// from input, since it is spliced into sql.
var tables = map[string]bool{
	"groups": true, "items": true, "meals": true,
	"ingredients": true, "plan_entries": true, "list_entries": true,
}

// del is how a row is deleted: a tombstone with the write's rev. deleting a
// deleted or missing row changes nothing and is not an error.
func (t *tx) del(ctx context.Context, table, id string) error {
	if !tables[table] {
		return fmt.Errorf("del: unknown table %q", table)
	}
	_, err := t.ExecContext(ctx,
		`UPDATE `+table+` SET deleted = 1, rev = ? WHERE id = ? AND deleted = 0`, t.rev, id)
	return err
}
