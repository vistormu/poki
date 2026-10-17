package store

import (
	"context"
	"errors"
	"testing"

	"poki/domain/model"
)

func TestNoMealIsMadeByAMigration(t *testing.T) {
	ctx := context.Background()
	s := New(testDB(t))
	var row struct {
		Name string `db:"name"`
		Rev  int64  `db:"rev"`
	}
	if err := s.db.Get(&row, `SELECT name, rev FROM meals WHERE id = ? AND deleted = 0`, model.NoMeal); err != nil {
		t.Fatalf("no meal: %v", err)
	}
	// a rev above 0, so a phone's first sync (since 0) brings it
	if rev, _ := s.Rev(ctx); row.Rev < 1 || row.Rev > rev {
		t.Errorf("no meal at rev %d, counter %d", row.Rev, rev)
	}
	if meals, _ := s.Meals(ctx); len(meals) != 0 {
		t.Errorf("Meals = %v, want none: no meal is hidden", meals)
	}
	if err := s.RenameMeal(ctx, model.NoMeal, "x"); !errors.Is(err, model.ErrNotFound) {
		t.Errorf("rename no meal: err = %v", err)
	}
	if err := s.DeleteMeal(ctx, model.NoMeal); !errors.Is(err, model.ErrNotFound) {
		t.Errorf("delete no meal: err = %v", err)
	}
}

func TestDeleteIngredientTwice(t *testing.T) {
	ctx := context.Background()
	s := New(testDB(t))
	seed(t, s, sweepSeed)
	if err := s.DeleteIngredient(ctx, "n"); err != nil {
		t.Fatal(err)
	}
	if err := s.DeleteIngredient(ctx, "n"); !errors.Is(err, model.ErrNotFound) {
		t.Errorf("err = %v, want ErrNotFound", err)
	}
	if !alive(t, s)["in-meal"] {
		t.Error("a grouped item went with its last ingredient")
	}
}
