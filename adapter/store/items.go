package store

import (
	"context"
	"fmt"

	"poki/domain/model"
)

func (s *Store) Items(ctx context.Context) ([]model.Item, error) {
	items := []model.Item{}
	err := s.db.SelectContext(ctx, &items,
		`SELECT id, name, unit, coalesce(group_id, '') AS group_id FROM items WHERE deleted = 0`)
	return items, err
}

func (s *Store) AddItem(ctx context.Context, it model.Item) error {
	return s.write(ctx, func(t *tx) error {
		_, err := t.ExecContext(ctx, `INSERT INTO items (id, name, unit, group_id, rev)
			VALUES (?, ?, ?, nullif(?, ''), ?)`, it.ID, it.Name, it.Unit, it.GroupID, t.rev)
		return err
	})
}

func (s *Store) UpdateItem(ctx context.Context, it model.Item) error {
	return s.write(ctx, func(t *tx) error {
		err := t.exec1(ctx, "item "+it.ID, `UPDATE items SET name = ?, unit = ?, group_id = nullif(?, ''), rev = ?
			WHERE id = ? AND deleted = 0`, it.Name, it.Unit, it.GroupID, t.rev, it.ID)
		if err != nil {
			return err
		}
		t.mayBeUnused = append(t.mayBeUnused, it.ID)
		return nil
	})
}

func (s *Store) DeleteItem(ctx context.Context, id string) error {
	return s.write(ctx, func(t *tx) error {
		var used bool
		if err := t.GetContext(ctx, &used, `SELECT
			EXISTS (SELECT 1 FROM ingredients WHERE item_id = ? AND deleted = 0) OR
			EXISTS (SELECT 1 FROM list_entries WHERE item_id = ? AND deleted = 0)`, id, id); err != nil {
			return err
		}
		if used {
			return fmt.Errorf("item %s: %w", id, model.ErrInUse)
		}
		return t.exec1(ctx, "item "+id, `UPDATE items SET deleted = 1, rev = ? WHERE id = ? AND deleted = 0`, t.rev, id)
	})
}
