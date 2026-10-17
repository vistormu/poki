package store

import (
	"context"

	"poki/domain/model"
)

func (s *Store) PlanEntries(ctx context.Context) ([]model.PlanEntry, error) {
	entries := []model.PlanEntry{}
	err := s.db.SelectContext(ctx, &entries,
		`SELECT id, date, slot, meal_id, position FROM plan_entries WHERE deleted = 0`)
	return entries, err
}

// lastIn is the position after a slot's last live entry.
const lastIn = `(SELECT coalesce(max(position), 0) + 1 FROM plan_entries
	WHERE date = ? AND slot = ? AND deleted = 0)`

func (s *Store) AddPlanEntry(ctx context.Context, e model.PlanEntry) (model.PlanEntry, error) {
	err := s.write(ctx, func(t *tx) error {
		return t.GetContext(ctx, &e.Position, `INSERT INTO plan_entries (id, date, slot, meal_id, position, rev)
			VALUES (?, ?, ?, ?, `+lastIn+`, ?) RETURNING position`,
			e.ID, e.Date, e.Slot, e.MealID, e.Date, e.Slot, t.rev)
	})
	return e, err
}

func (s *Store) MovePlanEntry(ctx context.Context, id, date, slot string) error {
	return s.write(ctx, func(t *tx) error {
		return t.exec1(ctx, "plan entry "+id, `UPDATE plan_entries SET date = ?, slot = ?, position = `+lastIn+`, rev = ?
			WHERE id = ? AND deleted = 0`, date, slot, date, slot, t.rev, id)
	})
}

func (s *Store) SwapPlanEntries(ctx context.Context, a, b string) error {
	return s.write(ctx, func(t *tx) error {
		var ea, eb model.PlanEntry
		const q = `SELECT id, date, slot, meal_id, position FROM plan_entries WHERE id = ? AND deleted = 0`
		if err := t.GetContext(ctx, &ea, q, a); err != nil {
			return notFound(err, "plan entry "+a)
		}
		if err := t.GetContext(ctx, &eb, q, b); err != nil {
			return notFound(err, "plan entry "+b)
		}
		const set = `UPDATE plan_entries SET date = ?, slot = ?, position = ?, rev = ? WHERE id = ?`
		if _, err := t.ExecContext(ctx, set, eb.Date, eb.Slot, eb.Position, t.rev, a); err != nil {
			return err
		}
		_, err := t.ExecContext(ctx, set, ea.Date, ea.Slot, ea.Position, t.rev, b)
		return err
	})
}

func (s *Store) DeletePlanEntry(ctx context.Context, id string) error {
	return s.write(ctx, func(t *tx) error {
		return t.exec1(ctx, "plan entry "+id, `UPDATE plan_entries SET deleted = 1, rev = ? WHERE id = ? AND deleted = 0`, t.rev, id)
	})
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
