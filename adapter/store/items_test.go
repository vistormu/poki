package store

import (
	"context"
	"errors"
	"testing"

	"poki/domain/model"
)

// seed writes raw rows, rev 1: meals and the list have no store code yet.
func seed(t *testing.T, s *Store, sql string) {
	t.Helper()
	if _, err := s.db.Exec(sql); err != nil {
		t.Fatalf("seed: %v", err)
	}
}

func alive(t *testing.T, s *Store) map[string]bool {
	t.Helper()
	items, err := s.Items(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	ids := map[string]bool{}
	for _, it := range items {
		ids[it.ID] = true
	}
	return ids
}

// the rows every sweep test starts from: a group, a meal using one item, a
// list entry using another, and two items nothing uses (one grouped).
const sweepSeed = `
	INSERT INTO groups (id, name, position, rev) VALUES ('g', 'Dairy', 1, 1);
	INSERT INTO meals (id, name, rev) VALUES ('m', 'lasagna', 1);
	INSERT INTO items (id, name, unit, group_id, rev) VALUES
		('in-meal', 'mozzarella', 'g', 'g', 1),
		('on-list', 'milk', 'count', 'g', 1),
		('unused', 'butter', 'g', 'g', 1),
		('loose', 'salt', 'none', NULL, 1);
	INSERT INTO ingredients (id, meal_id, item_id, amount, rev) VALUES ('n', 'm', 'in-meal', 200, 1);
	INSERT INTO list_entries (id, item_id, state, rev) VALUES ('l', 'on-list', 'buy', 1);
	UPDATE rev SET value = 1;`

func TestDeleteGroupSweepsItsUnusedItems(t *testing.T) {
	ctx := context.Background()
	s := New(testDB(t))
	seed(t, s, sweepSeed)
	if err := s.DeleteGroup(ctx, "g"); err != nil {
		t.Fatal(err)
	}
	got := alive(t, s)
	for id, want := range map[string]bool{"in-meal": true, "on-list": true, "unused": false, "loose": true} {
		if got[id] != want {
			t.Errorf("%s alive = %v, want %v", id, got[id], want)
		}
	}
	// what changed carries the delete's rev, so phones hear of it
	var n int
	if err := s.db.Get(&n, `SELECT count(*) FROM items WHERE rev = 2`); err != nil {
		t.Fatal(err)
	}
	if n != 3 {
		t.Errorf("%d items at rev 2, want 3 (two to Other, one gone)", n)
	}
	var left int
	if err := s.db.Get(&left, `SELECT count(*) FROM items WHERE group_id IS NOT NULL`); err != nil {
		t.Fatal(err)
	}
	if left != 0 {
		t.Errorf("%d items still in the deleted group", left)
	}
}

func TestUngroupingSweeps(t *testing.T) {
	tests := []struct {
		id   string
		gone bool
	}{
		{"in-meal", false},
		{"on-list", false},
		{"unused", true},
	}
	for _, tt := range tests {
		t.Run(tt.id, func(t *testing.T) {
			ctx := context.Background()
			s := New(testDB(t))
			seed(t, s, sweepSeed)
			if err := s.UpdateItem(ctx, model.Item{ID: tt.id, Name: tt.id, Unit: "g"}); err != nil {
				t.Fatal(err)
			}
			if alive(t, s)[tt.id] == tt.gone {
				t.Errorf("%s gone = %v, want %v", tt.id, !tt.gone, tt.gone)
			}
		})
	}
}

func TestDeadUsesDontKeepAnItem(t *testing.T) {
	ctx := context.Background()
	s := New(testDB(t))
	seed(t, s, sweepSeed+`
		UPDATE ingredients SET deleted = 1;
		UPDATE list_entries SET deleted = 1;`)
	for _, id := range []string{"in-meal", "on-list"} {
		if err := s.UpdateItem(ctx, model.Item{ID: id, Name: id, Unit: "g"}); err != nil {
			t.Fatal(err)
		}
		if alive(t, s)[id] {
			t.Errorf("%s survives on a deleted use", id)
		}
	}
}

func TestANewUngroupedItemStays(t *testing.T) {
	ctx := context.Background()
	s := New(testDB(t))
	if err := s.AddItem(ctx, model.Item{ID: "i", Name: "salt", Unit: "none"}); err != nil {
		t.Fatal(err)
	}
	if !alive(t, s)["i"] {
		t.Error("an item made with no group is gone before anything used it")
	}
}

func TestDeleteItem(t *testing.T) {
	ctx := context.Background()
	s := New(testDB(t))
	seed(t, s, sweepSeed)
	for _, id := range []string{"in-meal", "on-list"} {
		if err := s.DeleteItem(ctx, id); !errors.Is(err, model.ErrInUse) {
			t.Errorf("delete %s: err = %v, want ErrInUse", id, err)
		}
	}
	if err := s.DeleteItem(ctx, "unused"); err != nil {
		t.Fatal(err)
	}
	if err := s.DeleteItem(ctx, "unused"); !errors.Is(err, model.ErrNotFound) {
		t.Errorf("deleting twice: err = %v, want ErrNotFound", err)
	}
	if alive(t, s)["unused"] {
		t.Error("the deleted item is alive")
	}
}

func TestUpdateADeletedGroupOrItem(t *testing.T) {
	ctx := context.Background()
	s := New(testDB(t))
	seed(t, s, sweepSeed+`UPDATE groups SET deleted = 1; UPDATE items SET deleted = 1 WHERE id = 'loose';`)
	for name, err := range map[string]error{
		"rename group": s.RenameGroup(ctx, "g", "x"),
		"place groups": s.PlaceGroups(ctx, []string{"g"}),
		"delete group": s.DeleteGroup(ctx, "g"),
		"update item":  s.UpdateItem(ctx, model.Item{ID: "loose", Name: "x", Unit: "none"}),
	} {
		if !errors.Is(err, model.ErrNotFound) {
			t.Errorf("%s: err = %v, want ErrNotFound", name, err)
		}
	}
}
