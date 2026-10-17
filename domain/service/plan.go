package service

import (
	"cmp"
	"context"
	"slices"
	"strings"
	"time"

	"poki/domain/model"
)

type PlanStore interface {
	// PlanEntries are the live plan entries, in no order.
	PlanEntries(ctx context.Context) ([]model.PlanEntry, error)
	// AddPlanEntry places a meal last in a slot.
	AddPlanEntry(ctx context.Context, e model.PlanEntry) (model.PlanEntry, error)
	// MovePlanEntry puts an entry last in another slot.
	MovePlanEntry(ctx context.Context, id, date, slot string) error
	// SwapPlanEntries trades two entries' places.
	SwapPlanEntries(ctx context.Context, a, b string) error
	// DeletePlanEntry deletes an entry; its list entries stay.
	DeletePlanEntry(ctx context.Context, id string) error

	// Marks are the live list entries of a plan entry.
	Marks(ctx context.Context, planEntryID string) ([]model.ListEntry, error)
	AddListEntry(ctx context.Context, e model.ListEntry) error
	SetListEntryState(ctx context.Context, id, state string) error
	DeleteListEntry(ctx context.Context, id string) error
}

type Plan struct {
	store PlanStore
	meals *Meals
}

func NewPlan(store PlanStore, meals *Meals) *Plan {
	return &Plan{store: store, meals: meals}
}

const maxDays = 62

// Day is a date and its slots.
type Day struct {
	Date  string
	Slots map[string][]Planned // by model.Slots; a slot with nothing is empty
}

// Planned is a plan entry with its meal and its marks.
type Planned struct {
	model.PlanEntry
	Meal  model.Meal
	Marks []Mark // by item name
}

// Mark is a marked ingredient of a planned meal: its list entry and item.
type Mark struct {
	model.ListEntry
	Item model.Item
}

// Show is the plan of days days from from (a date), each day whole.
func (s *Plan) Show(ctx context.Context, from string, days int) ([]Day, error) {
	start, err := time.Parse(model.DateLayout, from)
	if err != nil {
		return nil, model.Invalid("A date is like 2026-10-17")
	}
	if days < 1 || days > maxDays {
		return nil, model.Invalid("Show 1 to %d days", maxDays)
	}
	entries, err := s.store.PlanEntries(ctx)
	if err != nil {
		return nil, err
	}
	meals, items, err := s.names(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]Day, days)
	index := map[string]int{}
	for i := range out {
		date := start.AddDate(0, 0, i).Format(model.DateLayout)
		out[i] = Day{Date: date, Slots: map[string][]Planned{}}
		index[date] = i
	}
	sortEntries(entries)
	for _, e := range entries {
		i, ok := index[e.Date]
		if !ok {
			continue
		}
		p := Planned{PlanEntry: e, Meal: meals[e.MealID]}
		marks, err := s.store.Marks(ctx, e.ID)
		if err != nil {
			return nil, err
		}
		for _, m := range marks {
			p.Marks = append(p.Marks, Mark{ListEntry: m, Item: items[m.ItemID]})
		}
		slices.SortFunc(p.Marks, func(a, b Mark) int {
			return cmp.Compare(strings.ToLower(a.Item.Name), strings.ToLower(b.Item.Name))
		})
		out[i].Slots[e.Slot] = append(out[i].Slots[e.Slot], p)
	}
	return out, nil
}

// Add places a meal last in a slot; mealRef "" is no meal. a slot with no
// meal takes nothing else, and no meal only goes in an empty slot.
func (s *Plan) Add(ctx context.Context, date, slot, mealRef string) (model.PlanEntry, error) {
	if err := checkPlace(date, slot); err != nil {
		return model.PlanEntry{}, err
	}
	mealID := model.NoMeal
	if mealRef != "" {
		m, err := s.meals.Find(ctx, mealRef)
		if err != nil {
			return model.PlanEntry{}, err
		}
		mealID = m.ID
	}
	in, err := s.slot(ctx, date, slot)
	if err != nil {
		return model.PlanEntry{}, err
	}
	if err := checkJoin(in, mealID); err != nil {
		return model.PlanEntry{}, err
	}
	return s.store.AddPlanEntry(ctx, model.PlanEntry{ID: model.NewID(), Date: date, Slot: slot, MealID: mealID})
}

// Remove takes an entry off the plan, no meal too. what its marks put on the
// list stays (spec → plan).
func (s *Plan) Remove(ctx context.Context, ref string) error {
	e, err := s.Find(ctx, ref)
	if err != nil {
		return err
	}
	return s.store.DeletePlanEntry(ctx, e.ID)
}

// Move puts a planned meal last in another slot. no meal is not moved: it is
// removed.
func (s *Plan) Move(ctx context.Context, ref, date, slot string) error {
	e, err := s.Find(ctx, ref)
	if err != nil {
		return err
	}
	if e.MealID == model.NoMeal {
		return model.Invalid("No meal is not moved, only removed")
	}
	if err := checkPlace(date, slot); err != nil {
		return err
	}
	in, err := s.slot(ctx, date, slot)
	if err != nil {
		return err
	}
	if err := checkJoin(in, e.MealID); err != nil {
		return err
	}
	return s.store.MovePlanEntry(ctx, e.ID, date, slot)
}

// Swap trades the places of two planned meals.
func (s *Plan) Swap(ctx context.Context, refA, refB string) error {
	a, err := s.Find(ctx, refA)
	if err != nil {
		return err
	}
	b, err := s.Find(ctx, refB)
	if err != nil {
		return err
	}
	switch {
	case a.MealID == model.NoMeal || b.MealID == model.NoMeal:
		return model.Invalid("No meal is not moved, only removed")
	case a.ID == b.ID:
		return model.Invalid("A meal swaps with another")
	}
	return s.store.SwapPlanEntries(ctx, a.ID, b.ID)
}

// Mark marks an ingredient of a planned meal: buy and check put it on the list
// with the ingredient's amount, none takes it off (decisions/0009).
func (s *Plan) Mark(ctx context.Context, ref, itemRef, mark string) error {
	if !slices.Contains(model.Marks, mark) {
		return model.Invalid("Mark it one of %s", strings.Join(model.Marks, ", "))
	}
	e, err := s.Find(ctx, ref)
	if err != nil {
		return err
	}
	it, err := s.meals.items.Find(ctx, itemRef)
	if err != nil {
		return err
	}
	marks, err := s.store.Marks(ctx, e.ID)
	if err != nil {
		return err
	}
	var current *model.ListEntry
	for _, m := range marks {
		if m.ItemID == it.ID {
			current = &m
		}
	}
	if mark == model.MarkNone {
		if current == nil {
			return nil
		}
		return s.store.DeleteListEntry(ctx, current.ID)
	}
	if current != nil {
		if current.State == mark || current.State == model.StateBought && mark == model.StateBuy {
			return nil
		}
		return s.store.SetListEntryState(ctx, current.ID, mark)
	}
	ins, err := s.meals.store.Ingredients(ctx, e.MealID)
	if err != nil {
		return err
	}
	for _, in := range ins {
		if in.ItemID == it.ID {
			return s.store.AddListEntry(ctx, model.ListEntry{
				ID: model.NewID(), ItemID: it.ID, Amount: in.Amount, PlanEntryID: e.ID, State: mark,
			})
		}
	}
	return model.Invalid("%s is not in this meal", it.Name)
}

// Find is the plan entry ref names: its id or the start of it.
func (s *Plan) Find(ctx context.Context, ref string) (model.PlanEntry, error) {
	all, err := s.store.PlanEntries(ctx)
	if err != nil {
		return model.PlanEntry{}, err
	}
	return find(all, ref, "plan entry", func(e model.PlanEntry) string { return e.ID }, func(model.PlanEntry) string { return "" })
}

// slot is what a slot holds now.
func (s *Plan) slot(ctx context.Context, date, slot string) ([]model.PlanEntry, error) {
	all, err := s.store.PlanEntries(ctx)
	if err != nil {
		return nil, err
	}
	var in []model.PlanEntry
	for _, e := range all {
		if e.Date == date && e.Slot == slot {
			in = append(in, e)
		}
	}
	return in, nil
}

// names are the meals (no meal too) and items by id.
func (s *Plan) names(ctx context.Context) (map[string]model.Meal, map[string]model.Item, error) {
	meals, err := s.meals.store.Meals(ctx)
	if err != nil {
		return nil, nil, err
	}
	items, err := s.meals.items.store.Items(ctx)
	if err != nil {
		return nil, nil, err
	}
	m := map[string]model.Meal{model.NoMeal: {ID: model.NoMeal, Name: "No meal"}}
	for _, meal := range meals {
		m[meal.ID] = meal
	}
	it := map[string]model.Item{}
	for _, item := range items {
		it[item.ID] = item
	}
	return m, it, nil
}

func checkPlace(date, slot string) error {
	switch {
	case !model.IsDate(date):
		return model.Invalid("A date is like 2026-10-17")
	case !model.IsSlot(slot):
		return model.Invalid("The slot is %s", strings.Join(model.Slots, " or "))
	}
	return nil
}

// checkJoin: can a meal (or no meal) join a slot holding in?
func checkJoin(in []model.PlanEntry, mealID string) error {
	for _, e := range in {
		if e.MealID == model.NoMeal {
			return model.Invalid("That slot is no meal")
		}
	}
	if mealID == model.NoMeal && len(in) > 0 {
		return model.Invalid("No meal goes in an empty slot")
	}
	return nil
}

// sortEntries orders entries as the plan reads: by date, lunch then dinner,
// then position.
func sortEntries(entries []model.PlanEntry) {
	slices.SortFunc(entries, func(a, b model.PlanEntry) int {
		return cmp.Or(cmp.Compare(a.Date, b.Date),
			cmp.Compare(slices.Index(model.Slots, a.Slot), slices.Index(model.Slots, b.Slot)),
			cmp.Compare(a.Position, b.Position))
	})
}
