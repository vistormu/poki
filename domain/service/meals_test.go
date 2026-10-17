package service

import (
	"context"
	"strings"
	"testing"

	"poki/adapter/store"
	"poki/domain/model"
)

func newMeals(t *testing.T) (*Meals, *Items, *store.Store) {
	t.Helper()
	_, items, st := newServices(t)
	return NewMeals(st, items), items, st
}

func n(f float64) *float64 { return &f }

func TestAddMeal(t *testing.T) {
	tests := []struct {
		name, want, err string
	}{
		{"lasagna", "lasagna", ""},
		{"  pad thai ", "pad thai", ""},
		{strings.Repeat("a", 41), "", "longer than 40"},
		{"", "", "needs a name"},
		{"Soup", "", "already a meal called “soup”"},
		{"no meal", "", "No meal is"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := context.Background()
			meals, _, _ := newMeals(t)
			must[model.Meal](t)(meals.Add(ctx, "soup"))
			m, err := meals.Add(ctx, tt.name)
			wantErr(t, err, tt.err)
			if m.Name != tt.want {
				t.Errorf("name %q, want %q", m.Name, tt.want)
			}
		})
	}
}

func TestNoMealIsHiddenAndUntouchable(t *testing.T) {
	ctx := context.Background()
	meals, _, _ := newMeals(t)
	must[model.Meal](t)(meals.Add(ctx, "soup"))
	if all := must[[]model.Meal](t)(meals.List(ctx)); len(all) != 1 || all[0].Name != "soup" {
		t.Errorf("meals %v, want only soup", all)
	}
	for _, ref := range []string{model.NoMeal, "No meal", "0000"} {
		wantErr(t, meals.Rename(ctx, ref, "x"), "not found")
		wantErr(t, meals.Remove(ctx, ref), "not found")
	}
}

func TestListMealsAlphabetical(t *testing.T) {
	ctx := context.Background()
	meals, _, _ := newMeals(t)
	for _, name := range []string{"soup", "Lasagna", "curry", "Pad thai"} {
		must[model.Meal](t)(meals.Add(ctx, name))
	}
	var got []string
	for _, m := range must[[]model.Meal](t)(meals.List(ctx)) {
		got = append(got, m.Name)
	}
	if want := "curry Lasagna Pad thai soup"; strings.Join(got, " ") != want {
		t.Errorf("meals %q, want %q", strings.Join(got, " "), want)
	}
}

func TestRenameMeal(t *testing.T) {
	ctx := context.Background()
	meals, _, _ := newMeals(t)
	must[model.Meal](t)(meals.Add(ctx, "soup"))
	must[model.Meal](t)(meals.Add(ctx, "curry"))
	wantErr(t, meals.Rename(ctx, "soup", "Curry"), "already a meal called “curry”")
	wantErr(t, meals.Rename(ctx, "soup", "SOUP"), "")
	wantErr(t, meals.Rename(ctx, "soup", "tomato soup"), "")
	wantErr(t, meals.Rename(ctx, "tomato soup", "No Meal"), "No meal is")
	if _, err := meals.Find(ctx, "tomato soup"); err != nil {
		t.Error(err)
	}
}

func TestIngredients(t *testing.T) {
	ctx := context.Background()
	meals, items, _ := newMeals(t)
	must[model.Meal](t)(meals.Add(ctx, "lasagna"))
	for _, it := range [][2]string{{"mozzarella", "g"}, {"onion", "count"}, {"salt", "none"}} {
		must[model.Item](t)(items.Add(ctx, it[0], it[1], ""))
	}

	wantErr(t, meals.AddIngredient(ctx, "lasagna", "mozzarella", n(200)), "")
	wantErr(t, meals.AddIngredient(ctx, "lasagna", "onion", n(0.5)), "")
	wantErr(t, meals.AddIngredient(ctx, "lasagna", "salt", nil), "")
	wantErr(t, meals.AddIngredient(ctx, "lasagna", "mozzarella", n(100)), "lasagna already has mozzarella")
	wantErr(t, meals.AddIngredient(ctx, "lasagna", "basil", nil), "item “basil”: not found")
	wantErr(t, meals.AddIngredient(ctx, "pizza", "salt", nil), "meal “pizza”: not found")
	wantErr(t, meals.AddIngredient(ctx, "no meal", "salt", nil), "not found")

	show := func() string {
		t.Helper()
		_, ins, err := meals.Ingredients(ctx, "lasagna")
		if err != nil {
			t.Fatal(err)
		}
		var s []string
		for _, in := range ins {
			s = append(s, strings.TrimSpace(in.Item.Name+" "+model.FormatAmount(in.Amount, in.Item.Unit)))
		}
		return strings.Join(s, ", ")
	}
	if got := show(); got != "mozzarella 200 g, onion 0.5, salt" {
		t.Errorf("ingredients %q", got)
	}

	wantErr(t, meals.SetIngredient(ctx, "lasagna", "mozzarella", n(250)), "")
	wantErr(t, meals.SetIngredient(ctx, "lasagna", "onion", nil), "")
	wantErr(t, meals.SetIngredient(ctx, "lasagna", "salt", n(1)), "salt has no amount")
	wantErr(t, meals.SetIngredient(ctx, "lasagna", "mozzarella", n(0)), "more than 0")
	wantErr(t, meals.SetIngredient(ctx, "lasagna", "mozzarella", n(-1)), "more than 0")
	if got := show(); got != "mozzarella 250 g, onion, salt" {
		t.Errorf("ingredients after set %q", got)
	}

	// an item a meal uses can't be deleted; taken off, the unused, ungrouped one goes
	wantErr(t, items.Remove(ctx, "salt"), "uses “salt”")
	wantErr(t, meals.RemoveIngredient(ctx, "lasagna", "salt"), "")
	wantErr(t, meals.RemoveIngredient(ctx, "lasagna", "salt"), "not found")
	wantErr(t, meals.RemoveIngredient(ctx, "lasagna", "mozzarella"), "")
	wantErr(t, meals.RemoveIngredient(ctx, "lasagna", "mozzarella"), "not found")
	wantErr(t, meals.SetIngredient(ctx, "lasagna", "onion", n(1)), "")
	wantErr(t, meals.AddIngredient(ctx, "lasagna", "onion", n(1)), "already has onion")
	if got := show(); got != "onion 1" {
		t.Errorf("ingredients after rm %q", got)
	}
}

func TestReaddAnIngredient(t *testing.T) {
	ctx := context.Background()
	meals, items, _ := newMeals(t)
	groups := items.groups
	must[model.Group](t)(groups.Add(ctx, "Dairy"))
	must[model.Meal](t)(meals.Add(ctx, "lasagna"))
	must[model.Item](t)(items.Add(ctx, "mozzarella", "g", "dairy")) // grouped: it stays
	wantErr(t, meals.AddIngredient(ctx, "lasagna", "mozzarella", n(200)), "")
	wantErr(t, meals.RemoveIngredient(ctx, "lasagna", "mozzarella"), "")
	wantErr(t, meals.AddIngredient(ctx, "lasagna", "mozzarella", n(100)), "")
}

func TestRemoveMeal(t *testing.T) {
	ctx := context.Background()
	meals, items, st := newMeals(t)
	lasagna := must[model.Meal](t)(meals.Add(ctx, "lasagna"))
	must[model.Meal](t)(meals.Add(ctx, "soup"))
	must[model.Item](t)(items.Add(ctx, "mozzarella", "g", ""))
	must[model.Item](t)(items.Add(ctx, "onion", "count", ""))
	wantErr(t, meals.AddIngredient(ctx, "lasagna", "mozzarella", n(200)), "")
	wantErr(t, meals.AddIngredient(ctx, "lasagna", "onion", n(1)), "")
	wantErr(t, meals.AddIngredient(ctx, "soup", "onion", n(2)), "")
	// placed twice, one of them marked buy (the plan has no service yet: m4)
	seed(t, st, `
		INSERT INTO plan_entries (id, date, slot, meal_id, position, rev) VALUES
			('p1', '2026-10-17', 'dinner', '`+lasagna.ID+`', 1, 1),
			('p2', '2026-10-18', 'lunch', '`+lasagna.ID+`', 1, 1);
		INSERT INTO list_entries (id, item_id, amount, plan_entry_id, state, rev)
			SELECT 'l1', id, 200, 'p1', 'buy', 1 FROM items WHERE name = 'mozzarella';`)

	wantErr(t, meals.Remove(ctx, "lasagna"), "")
	wantErr(t, meals.Remove(ctx, "lasagna"), "not found")

	count := func(q string) int {
		t.Helper()
		var c int
		if err := st.DB().Get(&c, q); err != nil {
			t.Fatal(err)
		}
		return c
	}
	if c := count(`SELECT count(*) FROM plan_entries WHERE deleted = 0`); c != 0 {
		t.Errorf("%d plan entries left, want none", c)
	}
	if c := count(`SELECT count(*) FROM list_entries WHERE deleted = 0`); c != 1 {
		t.Errorf("%d list entries, want the one it made: it stays", c)
	}
	if c := count(`SELECT count(*) FROM ingredients WHERE deleted = 0`); c != 1 {
		t.Errorf("%d ingredients, want soup's", c)
	}
	// mozzarella is on the list, onion in soup: both stay
	if all := must[[]model.Item](t)(items.List(ctx)); len(all) != 2 {
		t.Errorf("items %v, want mozzarella and onion", all)
	}
}

// seed writes raw rows for what has no service yet.
func seed(t *testing.T, st *store.Store, sql string) {
	t.Helper()
	if _, err := st.DB().Exec(sql); err != nil {
		t.Fatalf("seed: %v", err)
	}
}
