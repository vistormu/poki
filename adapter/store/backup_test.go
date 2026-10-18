package store

import (
	"context"
	"path/filepath"
	"testing"
)

func TestBackup(t *testing.T) {
	ctx := context.Background()
	dir := t.TempDir()
	db, err := Open(filepath.Join(dir, "poki.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO meals (id, name, rev) VALUES ('m', 'Lasagna', 1)`); err != nil {
		t.Fatal(err)
	}

	to := filepath.Join(dir, "copy.db")
	if err := Backup(ctx, db, to); err != nil {
		t.Fatal(err)
	}
	if err := Backup(ctx, db, to); err == nil {
		t.Error("a backup over an existing file")
	}
	copied, err := Open(to)
	if err != nil {
		t.Fatal(err)
	}
	defer copied.Close()
	var name string
	if err := copied.GetContext(ctx, &name, `SELECT name FROM meals WHERE id = 'm'`); err != nil || name != "Lasagna" {
		t.Errorf("the copy holds %q, %v; want Lasagna", name, err)
	}
}
