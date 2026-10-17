package service

import (
	"cmp"
	"context"
	"slices"
	"strings"

	"poki/domain/model"
)

type MealStore interface {
	// Meals are the live meals, in no order, without no meal.
	Meals(ctx context.Context) ([]model.Meal, error)
	AddMeal(ctx context.Context, m model.Meal) error
	RenameMeal(ctx context.Context, id, name string) error
	// DeleteMeal deletes a meal, its ingredients and its plan entries; their
	// list entries stay on the list.
	DeleteMeal(ctx context.Context, id string) error

	// Ingredients are a meal's live ingredients, in no order.
	Ingredients(ctx context.Context, mealID string) ([]model.Ingredient, error)
	AddIngredient(ctx context.Context, in model.Ingredient) error
	SetIngredientAmount(ctx context.Context, id string, amount *float64) error
	// DeleteIngredient deletes an ingredient; its item goes if nothing else
	// keeps it.
	DeleteIngredient(ctx context.Context, id string) error
}

type Meals struct {
	store MealStore
	items *Items
}

func NewMeals(store MealStore, items *Items) *Meals {
	return &Meals{store: store, items: items}
}

const maxMealName = 40

// List is every meal, alphabetical. no meal is not one of them.
func (s *Meals) List(ctx context.Context) ([]model.Meal, error) {
	meals, err := s.store.Meals(ctx)
	if err != nil {
		return nil, err
	}
	slices.SortFunc(meals, func(a, b model.Meal) int {
		return cmp.Compare(strings.ToLower(a.Name), strings.ToLower(b.Name))
	})
	return meals, nil
}

// Find is the meal ref names: its id, its name or the start of its id. no
// meal is never found: it can't be edited.
func (s *Meals) Find(ctx context.Context, ref string) (model.Meal, error) {
	all, err := s.store.Meals(ctx)
	if err != nil {
		return model.Meal{}, err
	}
	return find(all, ref, "meal", func(m model.Meal) string { return m.ID }, func(m model.Meal) string { return m.Name })
}

// Add makes a meal with no ingredients. names are unique, ignoring case.
func (s *Meals) Add(ctx context.Context, name string) (model.Meal, error) {
	m := model.Meal{ID: model.NewID(), Name: name}
	m, err := s.check(ctx, m)
	if err != nil {
		return model.Meal{}, err
	}
	return m, s.store.AddMeal(ctx, m)
}

func (s *Meals) Rename(ctx context.Context, ref, name string) error {
	m, err := s.Find(ctx, ref)
	if err != nil {
		return err
	}
	m.Name = name
	if m, err = s.check(ctx, m); err != nil {
		return err
	}
	return s.store.RenameMeal(ctx, m.ID, m.Name)
}

// Remove deletes a meal and its plan entries (spec → meals).
func (s *Meals) Remove(ctx context.Context, ref string) error {
	m, err := s.Find(ctx, ref)
	if err != nil {
		return err
	}
	return s.store.DeleteMeal(ctx, m.ID)
}

// Ingredient is one of a meal's ingredients with its item.
type Ingredient struct {
	model.Ingredient
	Item model.Item
}

// Ingredients are a meal's ingredients, by item name.
func (s *Meals) Ingredients(ctx context.Context, ref string) (model.Meal, []Ingredient, error) {
	m, err := s.Find(ctx, ref)
	if err != nil {
		return model.Meal{}, nil, err
	}
	ins, err := s.store.Ingredients(ctx, m.ID)
	if err != nil {
		return model.Meal{}, nil, err
	}
	items, err := s.items.store.Items(ctx)
	if err != nil {
		return model.Meal{}, nil, err
	}
	byID := map[string]model.Item{}
	for _, it := range items {
		byID[it.ID] = it
	}
	out := make([]Ingredient, 0, len(ins))
	for _, in := range ins {
		out = append(out, Ingredient{Ingredient: in, Item: byID[in.ItemID]})
	}
	slices.SortFunc(out, func(a, b Ingredient) int {
		return cmp.Compare(strings.ToLower(a.Item.Name), strings.ToLower(b.Item.Name))
	})
	return m, out, nil
}

// AddIngredient adds an item to a meal, with an amount in the item's unit.
func (s *Meals) AddIngredient(ctx context.Context, mealRef, itemRef string, amount *float64) error {
	m, it, existing, err := s.ingredient(ctx, mealRef, itemRef)
	if err != nil {
		return err
	}
	if existing != nil {
		return model.Invalid("%s already has %s", m.Name, it.Name)
	}
	if err := checkAmount(it, amount); err != nil {
		return err
	}
	return s.store.AddIngredient(ctx, model.Ingredient{ID: model.NewID(), MealID: m.ID, ItemID: it.ID, Amount: amount})
}

// SetIngredient changes the amount of a meal's ingredient; nil is none.
func (s *Meals) SetIngredient(ctx context.Context, mealRef, itemRef string, amount *float64) error {
	m, it, existing, err := s.ingredient(ctx, mealRef, itemRef)
	if err != nil {
		return err
	}
	if existing == nil {
		return model.Invalid("%s has no %s", m.Name, it.Name)
	}
	if err := checkAmount(it, amount); err != nil {
		return err
	}
	return s.store.SetIngredientAmount(ctx, existing.ID, amount)
}

// RemoveIngredient takes an item off a meal; the item goes if nothing else
// keeps it (decisions/0012).
func (s *Meals) RemoveIngredient(ctx context.Context, mealRef, itemRef string) error {
	m, it, existing, err := s.ingredient(ctx, mealRef, itemRef)
	if err != nil {
		return err
	}
	if existing == nil {
		return model.Invalid("%s has no %s", m.Name, it.Name)
	}
	return s.store.DeleteIngredient(ctx, existing.ID)
}

// ingredient finds a meal, an item, and the meal's ingredient of that item
// (nil if it has none).
func (s *Meals) ingredient(ctx context.Context, mealRef, itemRef string) (model.Meal, model.Item, *model.Ingredient, error) {
	m, err := s.Find(ctx, mealRef)
	if err != nil {
		return model.Meal{}, model.Item{}, nil, err
	}
	it, err := s.items.Find(ctx, itemRef)
	if err != nil {
		return model.Meal{}, model.Item{}, nil, err
	}
	ins, err := s.store.Ingredients(ctx, m.ID)
	if err != nil {
		return model.Meal{}, model.Item{}, nil, err
	}
	for _, in := range ins {
		if in.ItemID == it.ID {
			return m, it, &in, nil
		}
	}
	return m, it, nil, nil
}

// checkAmount: an amount is above 0, and `none` items have none.
func checkAmount(it model.Item, amount *float64) error {
	switch {
	case amount == nil:
		return nil
	case it.Unit == model.UnitNone:
		return model.Invalid("%s has no amount", it.Name)
	case *amount <= 0:
		return model.Invalid("An amount is more than 0")
	}
	return nil
}

func (s *Meals) check(ctx context.Context, m model.Meal) (model.Meal, error) {
	name, err := checkName(m.Name, "meal", maxMealName)
	if err != nil {
		return model.Meal{}, err
	}
	m.Name = name
	if strings.EqualFold(name, "No meal") {
		return model.Meal{}, model.Invalid("No meal is the empty slot's")
	}
	all, err := s.store.Meals(ctx)
	if err != nil {
		return model.Meal{}, err
	}
	for _, o := range all {
		if o.ID != m.ID && strings.EqualFold(o.Name, name) {
			return model.Meal{}, model.Invalid("There is already a meal called “%s”", o.Name)
		}
	}
	return m, nil
}
