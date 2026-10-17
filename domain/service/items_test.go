package service

import (
	"context"
	"strings"
	"testing"

	"poki/domain/model"
)

func TestAddItem(t *testing.T) {
	tests := []struct {
		name, unit, group string
		want              model.Item // ID unchecked
		err               string
	}{
		{"mozzarella", "g", "dairy", model.Item{Name: "mozzarella", Unit: "g", GroupID: "dairy"}, ""},
		{" toilet paper ", "count", "", model.Item{Name: "toilet paper", Unit: "count"}, ""},
		{"salt", "none", "", model.Item{Name: "salt", Unit: "none"}, ""},
		{"milk", "ml", "", model.Item{}, "unit is one of g, count, none"},
		{"", "g", "", model.Item{}, "needs a name"},
		{strings.Repeat("a", 41), "g", "", model.Item{}, "longer than 40"},
		{"EGGS", "count", "", model.Item{}, "already an item called “eggs”"},
		{"bread", "count", "bakery", model.Item{}, "not found"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := context.Background()
			groups, items, _ := newServices(t)
			dairy := must[model.Group](t)(groups.Add(ctx, "Dairy"))
			must[model.Item](t)(items.Add(ctx, "eggs", "count", ""))
			it, err := items.Add(ctx, tt.name, tt.unit, tt.group)
			wantErr(t, err, tt.err)
			if tt.err != "" {
				return
			}
			if tt.want.GroupID == "dairy" {
				tt.want.GroupID = dairy.ID
			}
			tt.want.ID = it.ID
			if it != tt.want {
				t.Errorf("item %+v, want %+v", it, tt.want)
			}
			found := must[model.Item](t)(items.Find(ctx, it.ID))
			if found != tt.want {
				t.Errorf("stored %+v, want %+v", found, tt.want)
			}
		})
	}
}

func TestListItemsInPathOrder(t *testing.T) {
	ctx := context.Background()
	groups, items, _ := newServices(t)
	must[model.Group](t)(groups.Add(ctx, "Fruit"))
	must[model.Group](t)(groups.Add(ctx, "Dairy"))
	for _, it := range [][2]string{{"milk", "dairy"}, {"Apples", "fruit"}, {"toilet paper", ""}, {"banana", "fruit"}, {"butter", "dairy"}} {
		must[model.Item](t)(items.Add(ctx, it[0], "count", it[1]))
	}
	must[model.Item](t)(items.Add(ctx, "salt", "none", ""))
	wantErr(t, groups.Move(ctx, "dairy", 1), "")

	var got []string
	for _, it := range must[[]model.Item](t)(items.List(ctx)) {
		got = append(got, it.Name)
	}
	if want := "butter milk Apples banana salt toilet paper"; strings.Join(got, " ") != want {
		t.Errorf("items %q, want %q", strings.Join(got, " "), want)
	}
}

func TestGroupItem(t *testing.T) {
	ctx := context.Background()
	groups, items, _ := newServices(t)
	dairy := must[model.Group](t)(groups.Add(ctx, "Dairy"))
	must[model.Item](t)(items.Add(ctx, "milk", "count", ""))

	wantErr(t, items.Group(ctx, "milk", "dairy"), "")
	if it := must[model.Item](t)(items.Find(ctx, "milk")); it.GroupID != dairy.ID {
		t.Errorf("milk in %q, want dairy", it.GroupID)
	}
	wantErr(t, items.Group(ctx, "milk", "bakery"), "not found")
	wantErr(t, items.Group(ctx, "bread", "dairy"), "not found")

	// back to Other with nothing using it: it goes (decisions/0012)
	wantErr(t, items.Group(ctx, "milk", ""), "")
	wantErr(t, items.Group(ctx, "milk", "dairy"), "not found")
}

func TestEditItem(t *testing.T) {
	ctx := context.Background()
	groups, items, _ := newServices(t)
	dairy := must[model.Group](t)(groups.Add(ctx, "Dairy"))
	must[model.Item](t)(items.Add(ctx, "mozarella", "count", "dairy"))
	must[model.Item](t)(items.Add(ctx, "milk", "count", "dairy"))
	str := func(s string) *string { return &s }

	it, err := items.Edit(ctx, "mozarella", str(" mozzarella "), nil)
	wantErr(t, err, "")
	if it.Name != "mozzarella" || it.Unit != "count" || it.GroupID != dairy.ID {
		t.Errorf("after a rename %+v", it)
	}
	it, err = items.Edit(ctx, "mozzarella", nil, str("g"))
	wantErr(t, err, "")
	if it.Name != "mozzarella" || it.Unit != "g" {
		t.Errorf("after a unit change %+v", it)
	}
	_, err = items.Edit(ctx, "mozzarella", str("Milk"), nil)
	wantErr(t, err, "already an item called “milk”")
	_, err = items.Edit(ctx, "mozzarella", nil, str("kg"))
	wantErr(t, err, "unit is one of")
	it, err = items.Edit(ctx, "mozzarella", str("MOZZARELLA"), nil) // its own name, recased
	wantErr(t, err, "")
	if found := must[model.Item](t)(items.Find(ctx, "mozzarella")); found != it {
		t.Errorf("stored %+v, want %+v", found, it)
	}
}
