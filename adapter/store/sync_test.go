package store

import (
	"context"
	"errors"
	"testing"

	"poki/domain/model"
)

func TestSyncUndoesARejectedOpAlone(t *testing.T) {
	ctx := context.Background()
	s := New(testDB(t))
	ops := []model.Op{{Op: "a", ID: "m1"}, {Op: "b", ID: "m2"}, {Op: "c", ID: "m3"}, {Op: "d", ID: "m4"}}
	apply := func(t model.SyncTx, op model.Op) error {
		if err := t.Put("meals", op.ID, model.Row{"name": op.ID}); err != nil {
			return err
		}
		switch op.Op {
		case "b": // writes, then breaks a rule
			return model.Invalid("no")
		case "c": // a constraint the rules missed
			return t.Put("items", "i", model.Row{"name": "x", "unit": "ml", "group_id": nil})
		}
		return nil
	}
	rev, changes, rejected, err := s.Sync(ctx, 0, ops, apply, func(err error) bool { return errors.Is(err, model.ErrInvalid) })
	if err != nil {
		t.Fatal(err)
	}
	if len(rejected) != 2 || rejected[0].Op != "b" || rejected[1].Op != "c" {
		t.Errorf("rejected %+v, want b and c", rejected)
	}
	got := map[string]bool{}
	for _, c := range changes {
		if c.Table == "meals" && c.ID != model.NoMeal {
			got[c.ID] = true
			if c.Rev != rev {
				t.Errorf("%s at rev %d, want the sync's %d", c.ID, c.Rev, rev)
			}
		}
	}
	if !got["m1"] || got["m2"] || got["m3"] || !got["m4"] {
		t.Errorf("meals %v, want m1 and m4", got)
	}
}

func TestSyncFailsWholeOnAnotherError(t *testing.T) {
	ctx := context.Background()
	s := New(testDB(t))
	before, _ := s.Rev(ctx)
	disk := errors.New("disk")
	apply := func(t model.SyncTx, op model.Op) error {
		if err := t.Put("meals", op.ID, model.Row{"name": "x"}); err != nil {
			return err
		}
		return disk
	}
	_, _, _, err := s.Sync(ctx, 0, []model.Op{{Op: "a", ID: "m1"}}, apply, func(error) bool { return false })
	if !errors.Is(err, disk) {
		t.Fatalf("err = %v, want disk", err)
	}
	if after, _ := s.Rev(ctx); after != before {
		t.Errorf("rev %d → %d: a failed sync leaves nothing", before, after)
	}
	var n int
	if err := s.db.Get(&n, `SELECT count(*) FROM meals WHERE id = 'm1'`); err != nil || n != 0 {
		t.Errorf("m1 written (%d, %v)", n, err)
	}
}

func TestSyncTxPutAndGet(t *testing.T) {
	ctx := context.Background()
	s := New(testDB(t))
	apply := func(t model.SyncTx, op model.Op) error {
		if err := t.Put("ingredients", "n", model.Row{"meal_id": "m", "item_id": "i", "amount": 200.0}); err != nil {
			return err
		}
		row, deleted, ok, err := t.Get("ingredients", "n")
		switch {
		case err != nil:
			return err
		case !ok || deleted || row["amount"] != 200.0 || row["meal_id"] != "m":
			return errors.New("not as put")
		}
		if err := t.Put("ingredients", "n", model.Row{"amount": nil}); err != nil { // some columns
			return err
		}
		if err := t.Del("ingredients", "n"); err != nil {
			return err
		}
		if _, deleted, _, _ := t.Get("ingredients", "n"); !deleted {
			return errors.New("not deleted")
		}
		if rows, err := t.Live("ingredients", model.Row{"meal_id": "m"}); err != nil || len(rows) != 0 {
			return errors.New("a deleted row is live")
		}
		if _, err := t.Live("ingredients", model.Row{"1 OR 1": 1}); err == nil {
			return errors.New("Live took an unknown column")
		}
		return t.Put("ingredients; DROP TABLE meals", "x", model.Row{})
	}
	seed(t, s, `INSERT INTO meals (id, name, rev) VALUES ('m', 'lasagna', 1);
		INSERT INTO items (id, name, unit, rev) VALUES ('i', 'mozzarella', 'g', 1);`)
	_, _, _, err := s.Sync(ctx, 0, []model.Op{{Op: "a"}}, apply, func(error) bool { return false })
	if err == nil || err.Error() != `sync: unknown table "ingredients; DROP TABLE meals"` {
		t.Errorf("err = %v, want the unknown table", err)
	}
}
