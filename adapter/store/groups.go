package store

import (
	"context"

	"poki/domain/model"
)

func (s *Store) Groups(ctx context.Context) ([]model.Group, error) {
	groups := []model.Group{}
	err := s.db.SelectContext(ctx, &groups,
		`SELECT id, name, position FROM groups WHERE deleted = 0 ORDER BY position, name`)
	return groups, err
}

func (s *Store) AddGroup(ctx context.Context, id, name string) (model.Group, error) {
	g := model.Group{ID: id, Name: name}
	err := s.write(ctx, func(t *tx) error {
		return t.GetContext(ctx, &g.Position, `INSERT INTO groups (id, name, position, rev)
			VALUES (?, ?, (SELECT coalesce(max(position), 0) + 1 FROM groups WHERE deleted = 0), ?)
			RETURNING position`, id, name, t.rev)
	})
	return g, err
}

func (s *Store) RenameGroup(ctx context.Context, id, name string) error {
	return s.write(ctx, func(t *tx) error {
		return t.exec1(ctx, "group "+id, `UPDATE groups SET name = ?, rev = ? WHERE id = ? AND deleted = 0`, name, t.rev, id)
	})
}

func (s *Store) PlaceGroups(ctx context.Context, ids []string) error {
	return s.write(ctx, func(t *tx) error {
		for i, id := range ids {
			err := t.exec1(ctx, "group "+id, `UPDATE groups SET position = ?, rev = ? WHERE id = ? AND deleted = 0`, i+1, t.rev, id)
			if err != nil {
				return err
			}
		}
		return nil
	})
}

func (s *Store) DeleteGroup(ctx context.Context, id string) error {
	return s.write(ctx, func(t *tx) error {
		if err := t.exec1(ctx, "group "+id, `UPDATE groups SET deleted = 1, rev = ? WHERE id = ? AND deleted = 0`, t.rev, id); err != nil {
			return err
		}
		var items []string
		if err := t.SelectContext(ctx, &items, `UPDATE items SET group_id = NULL, rev = ?
			WHERE group_id = ? AND deleted = 0 RETURNING id`, t.rev, id); err != nil {
			return err
		}
		t.mayBeUnused = append(t.mayBeUnused, items...)
		return nil
	})
}
