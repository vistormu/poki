package service

import (
	"context"

	"strings"
	"testing"

	"poki/adapter/store"
)

// newServices builds the services on a fresh in-memory store: the rules are
// tested with the sql that keeps them, not a fake of it.
func newServices(t *testing.T) (*Groups, *Items, *store.Store) {
	t.Helper()
	db, err := store.OpenMemory()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	if _, err := store.Migrate(context.Background(), db); err != nil {
		t.Fatal(err)
	}
	st := store.New(db)
	groups := NewGroups(st)
	return groups, NewItems(st, groups), st
}

// wantErr checks err against want: "" is no error, else a piece of its message.
func wantErr(t *testing.T, err error, want string) {
	t.Helper()
	switch {
	case want == "" && err != nil:
		t.Fatalf("err = %v, want none", err)
	case want != "" && (err == nil || !strings.Contains(err.Error(), want)):
		t.Fatalf("err = %v, want one with %q", err, want)
	}
}

func must[T any](t *testing.T) func(T, error) T {
	return func(v T, err error) T {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
		return v
	}
}
