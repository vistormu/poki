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
