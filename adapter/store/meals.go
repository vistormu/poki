package store

import (
	"context"

	"poki/domain/model"
)

func (s *Store) Meals(ctx context.Context) ([]model.Meal, error) {
	meals := []model.Meal{}
	err := s.db.SelectContext(ctx, &meals, `SELECT id, name FROM meals WHERE deleted = 0 AND id != ?`, model.NoMeal)
	return meals, err
}

func (s *Store) AddMeal(ctx context.Context, m model.Meal) error {
	return s.write(ctx, func(t *tx) error {
		_, err := t.ExecContext(ctx, `INSERT INTO meals (id, name, rev) VALUES (?, ?, ?)`, m.ID, m.Name, t.rev)
		return err
	})
}

func (s *Store) RenameMeal(ctx context.Context, id, name string) error {
	return s.write(ctx, func(t *tx) error {
		return t.exec1(ctx, "meal "+id, `UPDATE meals SET name = ?, rev = ? WHERE id = ? AND id != ? AND deleted = 0`,
			name, t.rev, id, model.NoMeal)
	})
}

func (s *Store) DeleteMeal(ctx context.Context, id string) error {
	return s.write(ctx, func(t *tx) error {
		if err := t.exec1(ctx, "meal "+id, `UPDATE meals SET deleted = 1, rev = ? WHERE id = ? AND id != ? AND deleted = 0`,
			t.rev, id, model.NoMeal); err != nil {
			return err
		}
		var items []string
		if err := t.SelectContext(ctx, &items, `UPDATE ingredients SET deleted = 1, rev = ?
			WHERE meal_id = ? AND deleted = 0 RETURNING item_id`, t.rev, id); err != nil {
			return err
		}
		t.mayBeUnused = append(t.mayBeUnused, items...)
		_, err := t.ExecContext(ctx, `UPDATE plan_entries SET deleted = 1, rev = ? WHERE meal_id = ? AND deleted = 0`, t.rev, id)
		return err
	})
}

func (s *Store) Ingredients(ctx context.Context, mealID string) ([]model.Ingredient, error) {
	ins := []model.Ingredient{}
	err := s.db.SelectContext(ctx, &ins,
		`SELECT id, meal_id, item_id, amount FROM ingredients WHERE meal_id = ? AND deleted = 0`, mealID)
	return ins, err
}

func (s *Store) AddIngredient(ctx context.Context, in model.Ingredient) error {
	return s.write(ctx, func(t *tx) error {
		_, err := t.ExecContext(ctx, `INSERT INTO ingredients (id, meal_id, item_id, amount, rev) VALUES (?, ?, ?, ?, ?)`,
			in.ID, in.MealID, in.ItemID, in.Amount, t.rev)
		return err
	})
}

func (s *Store) SetIngredientAmount(ctx context.Context, id string, amount *float64) error {
	return s.write(ctx, func(t *tx) error {
		return t.exec1(ctx, "ingredient "+id, `UPDATE ingredients SET amount = ?, rev = ? WHERE id = ? AND deleted = 0`,
			amount, t.rev, id)
	})
}

func (s *Store) DeleteIngredient(ctx context.Context, id string) error {
	return s.write(ctx, func(t *tx) error {
		var item string
		if err := t.GetContext(ctx, &item, `UPDATE ingredients SET deleted = 1, rev = ?
			WHERE id = ? AND deleted = 0 RETURNING item_id`, t.rev, id); err != nil {
			return notFound(err, "ingredient "+id)
		}
		t.mayBeUnused = append(t.mayBeUnused, item)
		return nil
	})
}
