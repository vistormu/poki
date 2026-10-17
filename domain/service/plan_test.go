package service

import (
	"context"
	"strings"
	"testing"

	"poki/adapter/store"
	"poki/domain/model"
)

// newPlan has lasagna (mozzarella 200 g, onion 0.5, salt) and soup.
func newPlan(t *testing.T) (*Plan, *store.Store) {
	t.Helper()
	ctx := context.Background()
	meals, items, st := newMeals(t)
	must[model.Meal](t)(meals.Add(ctx, "lasagna"))
	must[model.Meal](t)(meals.Add(ctx, "soup"))
	for _, it := range [][2]string{{"mozzarella", "g"}, {"onion", "count"}, {"salt", "none"}} {
		must[model.Item](t)(items.Add(ctx, it[0], it[1], ""))
	}
	wantErr(t, meals.AddIngredient(ctx, "lasagna", "mozzarella", n(200)), "")
	wantErr(t, meals.AddIngredient(ctx, "lasagna", "onion", n(0.5)), "")
	wantErr(t, meals.AddIngredient(ctx, "lasagna", "salt", nil), "")
	return NewPlan(st, meals), st
}

// day says one day's plan: "lunch: lasagna soup / dinner: No meal".
func day(t *testing.T, p *Plan, date string) string {
	t.Helper()
	days := must[[]Day](t)(p.Show(context.Background(), date, 1))
	var slots []string
	for _, slot := range model.Slots {
		var meals []string
		for _, pl := range days[0].Slots[slot] {
			meals = append(meals, pl.Meal.Name)
		}
		slots = append(slots, slot+":"+strings.Join(meals, ","))
	}
	return strings.Join(slots, " ")
}

func add(t *testing.T, p *Plan, date, slot, meal string) model.PlanEntry {
	t.Helper()
	return must[model.PlanEntry](t)(p.Add(context.Background(), date, slot, meal))
}

func TestAddToPlan(t *testing.T) {
	ctx := context.Background()
	p, _ := newPlan(t)
	add(t, p, "2026-10-17", "dinner", "lasagna")
	add(t, p, "2026-10-17", "dinner", "soup")
	add(t, p, "2026-10-17", "dinner", "lasagna") // the same meal twice is fine
	add(t, p, "2026-10-17", "lunch", "")

	tests := []struct {
		date, slot, meal, err string
	}{
		{"2026-10-17", "lunch", "soup", "That slot is no meal"},
		{"2026-10-17", "lunch", "", "That slot is no meal"},
		{"2026-10-17", "dinner", "", "No meal goes in an empty slot"},
		{"2026-10-17", "brunch", "soup", "lunch or dinner"},
		{"17/10/2026", "lunch", "soup", "like 2026-10-17"},
		{"2026-02-30", "lunch", "soup", "like 2026-10-17"},
		{"2026-10-18", "lunch", "pizza", "not found"},
		{"2026-10-18", "lunch", "no meal", "not found"}, // no meal is --no-meal, not a name
	}
	for _, tt := range tests {
		_, err := p.Add(ctx, tt.date, tt.slot, tt.meal)
		wantErr(t, err, tt.err)
	}
	if got := day(t, p, "2026-10-17"); got != "lunch:No meal dinner:lasagna,soup,lasagna" {
		t.Errorf("plan %q", got)
	}
}

func TestShowDays(t *testing.T) {
	ctx := context.Background()
	p, _ := newPlan(t)
	add(t, p, "2026-10-31", "lunch", "soup")
	add(t, p, "2026-11-01", "dinner", "lasagna")
	add(t, p, "2026-11-02", "dinner", "lasagna") // past the range

	days := must[[]Day](t)(p.Show(ctx, "2026-10-30", 3))
	var dates []string
	for _, d := range days {
		dates = append(dates, d.Date)
	}
	if got := strings.Join(dates, " "); got != "2026-10-30 2026-10-31 2026-11-01" {
		t.Errorf("dates %q", got)
	}
	if len(days[0].Slots["lunch"]) != 0 || days[1].Slots["lunch"][0].Meal.Name != "soup" || len(days[2].Slots["dinner"]) != 1 {
		t.Errorf("days %+v", days)
	}
	_, err := p.Show(ctx, "2026-10-30", 0)
	wantErr(t, err, "1 to 62")
	_, err = p.Show(ctx, "tomorrow", 1)
	wantErr(t, err, "like 2026-10-17")
}

func TestRemoveFromPlan(t *testing.T) {
	ctx := context.Background()
	p, st := newPlan(t)
	e := add(t, p, "2026-10-17", "dinner", "lasagna")
	none := add(t, p, "2026-10-17", "lunch", "")
	wantErr(t, p.Mark(ctx, e.ID, "mozzarella", "buy"), "")

	wantErr(t, p.Remove(ctx, e.ID[:6]), "")
	wantErr(t, p.Remove(ctx, none.ID), "")
	wantErr(t, p.Remove(ctx, none.ID), "not found")
	if got := day(t, p, "2026-10-17"); got != "lunch: dinner:" {
		t.Errorf("plan %q", got)
	}
	// its list entry stays (spec → plan)
	var c int
	if err := st.DB().Get(&c, `SELECT count(*) FROM list_entries WHERE deleted = 0`); err != nil || c != 1 {
		t.Errorf("%d list entries (%v), want 1", c, err)
	}
	// the emptied slot takes anything
	add(t, p, "2026-10-17", "lunch", "soup")
}

func TestMove(t *testing.T) {
	ctx := context.Background()
	p, _ := newPlan(t)
	lasagna := add(t, p, "2026-10-17", "dinner", "lasagna")
	add(t, p, "2026-10-17", "dinner", "soup")
	add(t, p, "2026-10-18", "lunch", "soup")
	none := add(t, p, "2026-10-18", "dinner", "")

	wantErr(t, p.Move(ctx, lasagna.ID, "2026-10-18", "lunch"), "")
	if got := day(t, p, "2026-10-18"); got != "lunch:soup,lasagna dinner:No meal" {
		t.Errorf("after the move %q", got)
	}
	if got := day(t, p, "2026-10-17"); got != "lunch: dinner:soup" {
		t.Errorf("the slot it left %q", got)
	}
	wantErr(t, p.Move(ctx, lasagna.ID, "2026-10-18", "dinner"), "That slot is no meal")
	wantErr(t, p.Move(ctx, none.ID, "2026-10-19", "lunch"), "only removed")
	wantErr(t, p.Move(ctx, lasagna.ID, "2026-10-19", "tea"), "lunch or dinner")
	wantErr(t, p.Move(ctx, "beef", "2026-10-19", "lunch"), "not found")
}

func TestSwap(t *testing.T) {
	ctx := context.Background()
	p, _ := newPlan(t)
	lasagna := add(t, p, "2026-10-17", "dinner", "lasagna")
	soup := add(t, p, "2026-10-17", "dinner", "soup")
	other := add(t, p, "2026-10-18", "lunch", "soup")
	none := add(t, p, "2026-10-18", "dinner", "")

	wantErr(t, p.Swap(ctx, lasagna.ID, soup.ID), "") // within a slot: reorders
	if got := day(t, p, "2026-10-17"); got != "lunch: dinner:soup,lasagna" {
		t.Errorf("after a swap in a slot %q", got)
	}
	wantErr(t, p.Swap(ctx, lasagna.ID, other.ID), "")
	if got := day(t, p, "2026-10-17") + " / " + day(t, p, "2026-10-18"); got != "lunch: dinner:soup,soup / lunch:lasagna dinner:No meal" {
		t.Errorf("after a swap across days %q", got)
	}
	wantErr(t, p.Swap(ctx, lasagna.ID, none.ID), "only removed")
	wantErr(t, p.Swap(ctx, lasagna.ID, lasagna.ID), "with another")
}

func TestMark(t *testing.T) {
	ctx := context.Background()
	p, _ := newPlan(t)
	e := add(t, p, "2026-10-17", "dinner", "lasagna")
	soup := add(t, p, "2026-10-18", "dinner", "soup")
	none := add(t, p, "2026-10-18", "lunch", "")

	marks := func() string {
		t.Helper()
		days := must[[]Day](t)(p.Show(ctx, "2026-10-17", 1))
		var s []string
		for _, m := range days[0].Slots["dinner"][0].Marks {
			s = append(s, strings.TrimSpace(m.State+" "+m.Item.Name+" "+model.FormatAmount(m.Amount, m.Item.Unit)))
		}
		return strings.Join(s, ", ")
	}

	wantErr(t, p.Mark(ctx, e.ID, "mozzarella", "buy"), "")
	wantErr(t, p.Mark(ctx, e.ID, "onion", "check"), "")
	wantErr(t, p.Mark(ctx, e.ID, "salt", "none"), "") // unmarked already: nothing
	if got := marks(); got != "buy mozzarella 200 g, check onion 0.5" {
		t.Errorf("marks %q", got)
	}
	wantErr(t, p.Mark(ctx, e.ID, "onion", "buy"), "") // ? settled: buy
	wantErr(t, p.Mark(ctx, e.ID, "mozzarella", "none"), "")
	wantErr(t, p.Mark(ctx, e.ID, "mozzarella", "none"), "")
	wantErr(t, p.Mark(ctx, e.ID, "salt", "check"), "")
	if got := marks(); got != "buy onion 0.5, check salt" {
		t.Errorf("marks after changes %q", got)
	}

	wantErr(t, p.Mark(ctx, e.ID, "onion", "maybe"), "one of buy, check, none")
	wantErr(t, p.Mark(ctx, soup.ID, "onion", "buy"), "onion is not in this meal")
	wantErr(t, p.Mark(ctx, none.ID, "onion", "buy"), "onion is not in this meal")
	wantErr(t, p.Mark(ctx, e.ID, "basil", "buy"), "not found")

	// placed twice, each placement marks on its own (decisions/0009)
	twice := add(t, p, "2026-10-19", "lunch", "lasagna")
	wantErr(t, p.Mark(ctx, twice.ID, "onion", "buy"), "")
	days := must[[]Day](t)(p.Show(ctx, "2026-10-19", 1))
	if m := days[0].Slots["lunch"][0].Marks; len(m) != 1 || m[0].PlanEntryID != twice.ID {
		t.Errorf("the second placement's marks %+v", m)
	}
}

func TestMarkABoughtEntry(t *testing.T) {
	ctx := context.Background()
	p, st := newPlan(t)
	e := add(t, p, "2026-10-17", "dinner", "lasagna")
	wantErr(t, p.Mark(ctx, e.ID, "mozzarella", "buy"), "")
	seed(t, st, `UPDATE list_entries SET state = 'bought'`) // ticked in the store (m5)

	state := func() string {
		t.Helper()
		var s string
		if err := st.DB().Get(&s, `SELECT state FROM list_entries WHERE deleted = 0`); err != nil {
			t.Fatal(err)
		}
		return s
	}
	wantErr(t, p.Mark(ctx, e.ID, "mozzarella", "buy"), "")
	if s := state(); s != "bought" {
		t.Errorf("marking a bought ingredient buy made it %s, want it left bought", s)
	}
	wantErr(t, p.Mark(ctx, e.ID, "mozzarella", "check"), "")
	if s := state(); s != "check" {
		t.Errorf("state %s, want check", s)
	}
}
