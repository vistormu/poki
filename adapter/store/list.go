package store

import (
	"context"

	"github.com/jmoiron/sqlx"

	"poki/domain/model"
)

func (s *Store) ListEntries(ctx context.Context) ([]model.ListEntry, error) {
	entries := []model.ListEntry{}
	err := s.db.SelectContext(ctx, &entries, `SELECT `+listEntryCols+` FROM list_entries WHERE deleted = 0`)
	return entries, err
}

// ListEntryMeals are the meal names of the live list entries a mark made, by
// list entry id: the meal's even when it is off the plan or deleted.
func (s *Store) ListEntryMeals(ctx context.Context) (map[string]string, error) {
	var rows []struct {
		ID   string `db:"id"`
		Meal string `db:"meal"`
	}
	err := s.db.SelectContext(ctx, &rows, `SELECT l.id, m.name AS meal FROM list_entries l
		JOIN plan_entries p ON p.id = l.plan_entry_id JOIN meals m ON m.id = p.meal_id
		WHERE l.deleted = 0`)
	meals := map[string]string{}
	for _, r := range rows {
		meals[r.ID] = r.Meal
	}
	return meals, err
}

// listEntryCols reads a list entry, a missing plan entry as "".
const listEntryCols = `id, item_id, amount, coalesce(plan_entry_id, '') AS plan_entry_id, state`

func (s *Store) Marks(ctx context.Context, planEntryID string) ([]model.ListEntry, error) {
	entries := []model.ListEntry{}
	err := s.db.SelectContext(ctx, &entries,
		`SELECT `+listEntryCols+` FROM list_entries WHERE plan_entry_id = ? AND deleted = 0`, planEntryID)
	return entries, err
}

func (s *Store) AddListEntry(ctx context.Context, e model.ListEntry) error {
	return s.write(ctx, func(t *tx) error {
		_, err := t.ExecContext(ctx, `INSERT INTO list_entries (id, item_id, amount, plan_entry_id, state, rev)
			VALUES (?, ?, ?, nullif(?, ''), ?, ?)`, e.ID, e.ItemID, e.Amount, e.PlanEntryID, e.State, t.rev)
		return err
	})
}

func (s *Store) SetListEntryState(ctx context.Context, id, state string) error {
	return s.write(ctx, func(t *tx) error {
		return t.exec1(ctx, "list entry "+id, `UPDATE list_entries SET state = ?, rev = ? WHERE id = ? AND deleted = 0`, state, t.rev, id)
	})
}

func (s *Store) DeleteListEntry(ctx context.Context, id string) error {
	return s.write(ctx, func(t *tx) error {
		var item string
		if err := t.GetContext(ctx, &item, `UPDATE list_entries SET deleted = 1, rev = ?
			WHERE id = ? AND deleted = 0 RETURNING item_id`, t.rev, id); err != nil {
			return notFound(err, "list entry "+id)
		}
		t.mayBeUnused = append(t.mayBeUnused, item)
		return nil
	})
}

// SetListEntriesState sets the state of several live list entries in one
// write (ticking a row ticks all its entries).
func (s *Store) SetListEntriesState(ctx context.Context, ids []string, state string) error {
	if len(ids) == 0 {
		return nil
	}
	return s.write(ctx, func(t *tx) error {
		q, args, err := sqlx.In(`UPDATE list_entries SET state = ?, rev = ? WHERE id IN (?) AND deleted = 0`, state, t.rev, ids)
		if err != nil {
			return err
		}
		_, err = t.ExecContext(ctx, q, args...)
		return err
	})
}

// ClearList deletes every live list entry, whatever its state; their items go
// if nothing else keeps them.
func (s *Store) ClearList(ctx context.Context) error {
	return s.write(ctx, func(t *tx) error {
		var items []string
		if err := t.SelectContext(ctx, &items, `UPDATE list_entries SET deleted = 1, rev = ?
			WHERE deleted = 0 RETURNING item_id`, t.rev); err != nil {
			return err
		}
		t.mayBeUnused = append(t.mayBeUnused, items...)
		return nil
	})
}
