package service

import (
	"context"
	"errors"
	"fmt"
	"math"
	"strings"

	"poki/domain/model"
)

type SyncStore interface {
	// Sync applies each op with apply in one transaction, an op at a time: an
	// op whose apply fails with a rule's error is undone alone and rejected.
	// it returns the rev after, and every row past since.
	Sync(ctx context.Context, since int64, ops []model.Op, apply func(model.SyncTx, model.Op) error,
		rejectable func(error) bool) (rev int64, changes []model.Change, rejected []model.Rejected, err error)
	Rev(ctx context.Context) (int64, error)
}

type Sync struct {
	store SyncStore
}

func NewSync(store SyncStore) *Sync {
	return &Sync{store: store}
}

// Synced is what a phone gets back.
type Synced struct {
	Rev      int64
	Changes  []model.Change
	Rejected []model.Rejected
	// Reset: the phone was past the server (a db restored from a backup): it
	// drops what it has and takes Changes, which are everything.
	Reset bool
}

// Sync applies a phone's ops, in order, and answers with every row past since:
// theirs too, as the server now has them. last write wins.
func (s *Sync) Sync(ctx context.Context, since int64, ops []model.Op) (Synced, error) {
	rev, err := s.store.Rev(ctx)
	if err != nil {
		return Synced{}, err
	}
	var out Synced
	if since > rev || since < 0 {
		since, out.Reset = 0, true
	}
	out.Rev, out.Changes, out.Rejected, err = s.store.Sync(ctx, since, ops, apply, rejectable)
	return out, err
}

// rejectable: the op broke a rule, so the phone drops it; any other error
// fails the whole sync, and the phone sends it again.
func rejectable(err error) bool {
	return errors.Is(err, model.ErrInvalid) || errors.Is(err, model.ErrNotFound) || errors.Is(err, model.ErrInUse)
}

// apply is one op, with the rules the services keep for the terminal.
func apply(t model.SyncTx, op model.Op) error {
	spec, ok := tables[op.Table]
	switch {
	case !ok:
		return model.Invalid("no table %q", op.Table)
	case op.ID == "":
		return model.Invalid("no id")
	}
	switch op.Type {
	case model.OpPut:
		return put(t, spec, op)
	case model.OpDel:
		return del(t, op.Table, op.ID)
	}
	return model.Invalid("no op type %q", op.Type)
}

// column kinds: what a field holds. nullable is a flag above the others.
const (
	text     = iota // a string
	ref             // a string, an id; null for none when optional
	integer         // a whole number
	amount          // a number > 0, or null
	nullable        // marks ref as optional
)

type table struct {
	cols map[string]int // name → kind (| nullable)
	// check checks a whole row before it is written, and does what follows
	// from it. old is the row before (nil for a new one).
	check func(t model.SyncTx, id string, row, old model.Row) error
}

var tables = map[string]table{
	"groups":       {cols: map[string]int{"name": text, "position": integer}, check: checkGroup},
	"items":        {cols: map[string]int{"name": text, "unit": text, "group_id": ref | nullable}, check: checkItem},
	"meals":        {cols: map[string]int{"name": text}, check: checkMeal},
	"ingredients":  {cols: map[string]int{"meal_id": ref, "item_id": ref, "amount": amount}, check: checkIngredient},
	"plan_entries": {cols: map[string]int{"date": text, "slot": text, "meal_id": ref, "position": integer}, check: checkPlanEntry},
	"list_entries": {cols: map[string]int{"item_id": ref, "amount": amount, "plan_entry_id": ref | nullable, "state": text}, check: checkListEntry},
}

func put(t model.SyncTx, spec table, op model.Op) error {
	old, deleted, exists, err := t.Get(op.Table, op.ID)
	if err != nil {
		return err
	}
	if !exists {
		old = nil
	}
	row := model.Row{}
	for name := range spec.cols {
		row[name] = old[name] // nil for a new row
	}
	for name, v := range op.Fields {
		kind, ok := spec.cols[name]
		if !ok {
			return model.Invalid("%s has no field %q", op.Table, name)
		}
		if row[name], err = field(name, kind, v); err != nil {
			return err
		}
	}
	for name, kind := range spec.cols {
		if _, given := op.Fields[name]; !exists && !given && kind != amount && kind&nullable == 0 {
			return model.Invalid("a new row in %s needs %s", op.Table, name)
		}
	}
	if deleted {
		old = nil // it comes back: its old uses are gone
	}
	if err := spec.check(t, op.ID, row, old); err != nil {
		return err
	}
	return t.Put(op.Table, op.ID, row)
}

// field reads a json value as a column of kind.
func field(name string, kind int, v any) (any, error) {
	if v == nil {
		if kind == amount || kind&nullable != 0 {
			return nil, nil
		}
		return nil, model.Invalid("%s is missing", name)
	}
	switch kind &^ nullable {
	case text, ref:
		if s, ok := v.(string); ok {
			return s, nil
		}
	case integer:
		if f, ok := v.(float64); ok && f == math.Trunc(f) && math.Abs(f) < 1<<53 {
			return int64(f), nil
		}
	case amount:
		if f, ok := v.(float64); ok {
			return f, nil
		}
	}
	return nil, model.Invalid("%s is not what it should be", name)
}

// live fails unless the row exists and is not deleted.
func live(t model.SyncTx, table, id string) (model.Row, error) {
	row, deleted, ok, err := t.Get(table, id)
	if err != nil {
		return nil, err
	}
	if !ok || deleted {
		return nil, fmt.Errorf("%s %s: %w", table, id, model.ErrNotFound)
	}
	return row, nil
}

func checkGroup(_ model.SyncTx, _ string, row, _ model.Row) error {
	name, err := checkName(row["name"].(string), "group", maxGroupName)
	if err != nil {
		return err
	}
	row["name"] = name
	if row["position"].(int64) < 1 {
		return model.Invalid("a position is 1 or more")
	}
	return nil
}

func checkItem(t model.SyncTx, id string, row, old model.Row) error {
	name, err := checkName(row["name"].(string), "item", maxItemName)
	if err != nil {
		return err
	}
	row["name"] = name
	if !model.IsUnit(row["unit"].(string)) {
		return model.Invalid("The unit is one of %s", strings.Join(model.Units, ", "))
	}
	if g := row["group_id"]; g != nil {
		if _, err := live(t, "groups", g.(string)); err != nil {
			return err
		}
	} else if old != nil && old["group_id"] != nil {
		t.MayBeUnused(id) // taken off its group
	}
	return nil
}

func checkMeal(_ model.SyncTx, id string, row, _ model.Row) error {
	if id == model.NoMeal {
		return model.Invalid("No meal is never edited")
	}
	name, err := checkName(row["name"].(string), "meal", maxMealName)
	if err != nil {
		return err
	}
	row["name"] = name
	return nil
}

// checkUse checks the item a row uses and its amount, and hands the item it
// used before to the sweep.
func checkUse(t model.SyncTx, row, old model.Row) error {
	itemID := row["item_id"].(string)
	it, err := live(t, "items", itemID)
	if err != nil {
		return err
	}
	if a := row["amount"]; a != nil {
		switch {
		case it["unit"] == model.UnitNone:
			return model.Invalid("%s has no amount", it["name"])
		case a.(float64) <= 0:
			return model.Invalid("An amount is more than 0")
		}
	}
	if old != nil && old["item_id"] != itemID {
		t.MayBeUnused(old["item_id"].(string)) // repicked
	}
	return nil
}

// others are the live rows matching where, but for id.
func others(t model.SyncTx, table, id string, where model.Row) ([]model.Row, error) {
	rows, err := t.Live(table, where)
	var out []model.Row
	for _, r := range rows {
		if r["id"] != id {
			out = append(out, r)
		}
	}
	return out, err
}

func checkIngredient(t model.SyncTx, id string, row, old model.Row) error {
	mealID := row["meal_id"].(string)
	if mealID == model.NoMeal {
		return model.Invalid("No meal has no ingredients")
	}
	if _, err := live(t, "meals", mealID); err != nil {
		return err
	}
	if err := checkUse(t, row, old); err != nil {
		return err
	}
	same, err := others(t, "ingredients", id, model.Row{"meal_id": mealID, "item_id": row["item_id"]})
	if err != nil {
		return err
	}
	if len(same) > 0 {
		return model.Invalid("the meal already has that item")
	}
	return nil
}

func checkPlanEntry(t model.SyncTx, id string, row, _ model.Row) error {
	date, slot, mealID := row["date"].(string), row["slot"].(string), row["meal_id"].(string)
	if err := checkPlace(date, slot); err != nil {
		return err
	}
	if _, err := live(t, "meals", mealID); err != nil {
		return err
	}
	in, err := others(t, "plan_entries", id, model.Row{"date": date, "slot": slot})
	if err != nil {
		return err
	}
	var entries []model.PlanEntry
	for _, r := range in {
		entries = append(entries, model.PlanEntry{MealID: r["meal_id"].(string)})
	}
	return checkJoin(entries, mealID)
}

func checkListEntry(t model.SyncTx, id string, row, old model.Row) error {
	switch row["state"] {
	case model.StateCheck, model.StateBuy, model.StateBought:
	default:
		return model.Invalid("no state %q", row["state"])
	}
	if err := checkUse(t, row, old); err != nil {
		return err
	}
	p := row["plan_entry_id"]
	if p == nil {
		return nil
	}
	if _, err := live(t, "plan_entries", p.(string)); err != nil {
		return err
	}
	same, err := others(t, "list_entries", id, model.Row{"plan_entry_id": p, "item_id": row["item_id"]})
	if err != nil {
		return err
	}
	if len(same) > 0 {
		return model.Invalid("that ingredient is already marked")
	}
	return nil
}

// del deletes a row and what goes with it, as the services do. a row that is
// gone already, or never came, is no error: the phone may send a del twice.
func del(t model.SyncTx, table, id string) error {
	row, deleted, ok, err := t.Get(table, id)
	if err != nil || !ok || deleted {
		return err
	}
	switch table {
	case "groups":
		items, err := t.Live("items", model.Row{"group_id": id})
		if err != nil {
			return err
		}
		for _, it := range items {
			if err := t.Put("items", it["id"].(string), model.Row{"group_id": nil}); err != nil {
				return err
			}
			t.MayBeUnused(it["id"].(string))
		}
	case "items":
		for _, uses := range []string{"ingredients", "list_entries"} {
			rows, err := t.Live(uses, model.Row{"item_id": id})
			if err != nil {
				return err
			}
			if len(rows) > 0 {
				return fmt.Errorf("item %s: %w", id, model.ErrInUse)
			}
		}
	case "meals":
		if id == model.NoMeal {
			return model.Invalid("No meal is never deleted")
		}
		for _, with := range []string{"ingredients", "plan_entries"} {
			rows, err := t.Live(with, model.Row{"meal_id": id})
			if err != nil {
				return err
			}
			for _, r := range rows {
				if err := del(t, with, r["id"].(string)); err != nil {
					return err
				}
			}
		}
	case "ingredients", "list_entries":
		t.MayBeUnused(row["item_id"].(string))
	}
	return t.Del(table, id)
}
