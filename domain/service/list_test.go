package service

import (
	"context"
	"fmt"
	"strings"
	"testing"

	"poki/adapter/store"
	"poki/domain/model"
)

// newList has groups Fruit, Dairy (in that order) and lasagna (mozzarella
// 200 g, onion 0.5, salt) planned on 2026-10-17.
func newList(t *testing.T) (*List, *Plan, model.PlanEntry, *store.Store) {
	t.Helper()
	ctx := context.Background()
	p, st := newPlan(t)
	items := p.meals.items
	must[model.Group](t)(items.groups.Add(ctx, "Fruit"))
	must[model.Group](t)(items.groups.Add(ctx, "Dairy"))
	wantErr(t, items.Group(ctx, "mozzarella", "dairy"), "")
	must[model.Item](t)(items.Add(ctx, "apples", "count", "fruit"))
	must[model.Item](t)(items.Add(ctx, "toilet paper", "count", ""))
	e := add(t, p, "2026-10-17", "dinner", "lasagna")
	return NewList(st, items), p, e, st
}

// sheet says the list as the terminal reads it, one line per part.
func sheet(t *testing.T, l *List) string {
	t.Helper()
	s := must[Sheet](t)(l.Show(context.Background()))
	say := func(it model.Item, a *float64) string {
		return strings.TrimSpace(it.Name + " " + model.FormatAmount(a, it.Unit))
	}
	var parts []string
	var check []string
	for _, c := range s.Check {
		check = append(check, say(c.Item, c.Amount)+" ("+c.Meal+")")
	}
	if len(check) > 0 {
		parts = append(parts, "check: "+strings.Join(check, ", "))
	}
	for _, sh := range s.Groups {
		var rows []string
		for _, r := range sh.Rows {
			rows = append(rows, say(r.Item, r.Total))
		}
		parts = append(parts, sh.Group.Name+": "+strings.Join(rows, ", "))
	}
	var bought []string
	for _, r := range s.Bought {
		bought = append(bought, say(r.Item, r.Total))
	}
	if len(bought) > 0 {
		parts = append(parts, "bought: "+strings.Join(bought, ", "))
	}
	return strings.Join(parts, " / ")
}

func TestShowList(t *testing.T) {
	ctx := context.Background()
	l, p, e, _ := newList(t)
	if got := sheet(t, l); got != "" {
		t.Errorf("an empty list reads %q", got)
	}

	wantErr(t, p.meals.AddIngredient(ctx, "soup", "onion", n(1)), "")
	wantErr(t, p.meals.AddIngredient(ctx, "soup", "mozzarella", n(125)), "")
	s := add(t, p, "2026-10-18", "lunch", "soup")

	wantErr(t, p.Mark(ctx, e.ID, "mozzarella", "buy"), "")
	wantErr(t, p.Mark(ctx, s.ID, "mozzarella", "buy"), "")
	wantErr(t, p.Mark(ctx, e.ID, "onion", "check"), "")
	wantErr(t, p.Mark(ctx, s.ID, "onion", "check"), "")
	wantErr(t, p.Mark(ctx, e.ID, "salt", "buy"), "")
	wantErr(t, l.Add(ctx, "toilet paper", nil), "")
	wantErr(t, l.Add(ctx, "apples", n(6)), "")
	wantErr(t, l.Add(ctx, "apples", n(2)), "")
	wantErr(t, l.Add(ctx, "mozzarella", nil), "") // no amount: adds nothing to the sum

	// ? one per entry with its meal; to buy summed, in path order, Other last
	want := "check: onion 0.5 (lasagna), onion 1 (soup) / Fruit: apples 8 / Dairy: mozzarella 325 g / Other: salt, toilet paper"
	if got := sheet(t, l); got != want {
		t.Errorf("list\n got %q\nwant %q", got, want)
	}

	// a meal off the plan, or deleted, still names its ? entry
	wantErr(t, p.Remove(ctx, s.ID), "")
	wantErr(t, p.meals.Remove(ctx, "soup"), "")
	if got := sheet(t, l); !strings.Contains(got, "onion 1 (soup)") {
		t.Errorf("list %q, want soup's ? entry still named", got)
	}
}

func TestAddToList(t *testing.T) {
	ctx := context.Background()
	l, _, _, _ := newList(t)
	wantErr(t, l.Add(ctx, "salt", n(1)), "salt has no amount")
	wantErr(t, l.Add(ctx, "apples", n(0)), "more than 0")
	wantErr(t, l.Add(ctx, "bread", nil), "not found")
	wantErr(t, l.Add(ctx, "apples", n(0.5)), "")
	if got := sheet(t, l); got != "Fruit: apples 0.5" {
		t.Errorf("list %q", got)
	}
}

func TestResolve(t *testing.T) {
	ctx := context.Background()
	l, p, e, _ := newList(t)
	twice := add(t, p, "2026-10-19", "dinner", "lasagna")
	wantErr(t, p.Mark(ctx, e.ID, "onion", "check"), "")
	wantErr(t, p.Mark(ctx, twice.ID, "onion", "check"), "")
	wantErr(t, p.Mark(ctx, e.ID, "mozzarella", "check"), "")

	wantErr(t, l.Resolve(ctx, "onion", "buy"), "2 ? entries are called “onion”: use the id")
	wantErr(t, l.Resolve(ctx, "mozzarella", "maybe"), "buy or have")
	wantErr(t, l.Resolve(ctx, "mozzarella", "buy"), "")
	wantErr(t, l.Resolve(ctx, "mozzarella", "buy"), "not found") // no longer ?

	for _, c := range must[Sheet](t)(l.Show(ctx)).Check {
		if c.PlanEntryID == twice.ID {
			wantErr(t, l.Resolve(ctx, c.ID, "have"), "")
		}
	}
	if got := sheet(t, l); got != "check: onion 0.5 (lasagna) / Dairy: mozzarella 200 g" {
		t.Errorf("list %q", got)
	}
	// the planned meal's mark follows: have is unmarked
	days := must[[]Day](t)(p.Show(ctx, "2026-10-17", 3))
	if m := days[0].Slots["dinner"][0].Marks; len(m) != 2 {
		t.Errorf("marks %+v, want onion ? and mozzarella buy", m)
	}
}

func TestTick(t *testing.T) {
	ctx := context.Background()
	l, p, e, _ := newList(t)
	wantErr(t, p.Mark(ctx, e.ID, "mozzarella", "buy"), "")
	wantErr(t, p.Mark(ctx, e.ID, "onion", "check"), "")
	wantErr(t, l.Add(ctx, "mozzarella", n(100)), "")
	wantErr(t, l.Add(ctx, "apples", n(3)), "")

	wantErr(t, l.Tick(ctx, "mozzarella"), "") // the row: both its entries
	wantErr(t, l.Tick(ctx, "mozzarella"), "mozzarella is not to buy")
	wantErr(t, l.Tick(ctx, "onion"), "onion is not to buy") // ? is settled first
	if got := sheet(t, l); got != "check: onion 0.5 (lasagna) / Fruit: apples 3 / bought: mozzarella 300 g" {
		t.Errorf("list %q", got)
	}
	// more of a bought item: a new row to buy, the bought one stays
	wantErr(t, l.Add(ctx, "mozzarella", n(50)), "")
	wantErr(t, l.Tick(ctx, "apples"), "")
	if got := sheet(t, l); got != "check: onion 0.5 (lasagna) / Dairy: mozzarella 50 g / bought: apples 3, mozzarella 300 g" {
		t.Errorf("list %q", got)
	}
	wantErr(t, l.Untick(ctx, "mozzarella"), "")
	wantErr(t, l.Untick(ctx, "mozzarella"), "mozzarella is not bought")
	if got := sheet(t, l); got != "check: onion 0.5 (lasagna) / Dairy: mozzarella 350 g / bought: apples 3" {
		t.Errorf("list %q", got)
	}
}

func TestClear(t *testing.T) {
	ctx := context.Background()
	l, p, e, st := newList(t)
	must[model.Item](t)(p.meals.items.Add(ctx, "candles", "count", ""))
	wantErr(t, p.Mark(ctx, e.ID, "mozzarella", "buy"), "")
	wantErr(t, p.Mark(ctx, e.ID, "onion", "check"), "")
	wantErr(t, l.Add(ctx, "candles", nil), "")
	wantErr(t, l.Add(ctx, "apples", nil), "")
	wantErr(t, l.Tick(ctx, "apples"), "")

	wantErr(t, l.Clear(ctx), "")
	if got := sheet(t, l); got != "" {
		t.Errorf("a cleared list reads %q", got)
	}
	// candles: ungrouped, only on the list, gone with it. the rest stays
	var names []string
	for _, it := range must[[]model.Item](t)(p.meals.items.List(ctx)) {
		names = append(names, it.Name)
	}
	if got := fmt.Sprint(names); got != "[apples mozzarella onion salt toilet paper]" {
		t.Errorf("items after clearing %s", got)
	}
	// the planned meal is unmarked
	days := must[[]Day](t)(p.Show(ctx, "2026-10-17", 1))
	if m := days[0].Slots["dinner"][0].Marks; len(m) != 0 {
		t.Errorf("marks after clearing %+v", m)
	}
	var c int
	if err := st.DB().Get(&c, `SELECT count(*) FROM list_entries WHERE deleted = 1`); err != nil || c != 4 {
		t.Errorf("%d tombstones (%v), want 4", c, err)
	}
}
