package service

import (
	"context"
	"strings"
	"testing"

	"poki/domain/model"
)

func names(groups []model.Group) string {
	var s []string
	for _, g := range groups {
		s = append(s, g.Name)
	}
	return strings.Join(s, " ")
}

func TestAddGroup(t *testing.T) {
	tests := []struct {
		name, want, err string
	}{
		{"Bakery", "Bakery", ""},
		{"  Bakery  ", "Bakery", ""},
		{strings.Repeat("a", 24), strings.Repeat("a", 24), ""},
		{strings.Repeat("a", 25), "", "longer than 24"},
		{" ", "", "needs a name"},
		{"dairy", "", "already called “Dairy”"},
		{"other", "", "Other is where"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := context.Background()
			groups, _, _ := newServices(t)
			must[model.Group](t)(groups.Add(ctx, "Dairy"))
			g, err := groups.Add(ctx, tt.name)
			wantErr(t, err, tt.err)
			if g.Name != tt.want {
				t.Errorf("name %q, want %q", g.Name, tt.want)
			}
			if tt.err == "" && g.Position != 2 {
				t.Errorf("position %d, want 2: last on the path", g.Position)
			}
		})
	}
}

func TestRenameGroup(t *testing.T) {
	ctx := context.Background()
	groups, _, _ := newServices(t)
	must[model.Group](t)(groups.Add(ctx, "Dairy"))
	must[model.Group](t)(groups.Add(ctx, "Fruit"))

	wantErr(t, groups.Rename(ctx, "dairy", "DAIRY"), "") // its own name, recased
	wantErr(t, groups.Rename(ctx, "dairy", "fruit"), "already called “Fruit”")
	wantErr(t, groups.Rename(ctx, "bakery", "Bread"), "not found")
	wantErr(t, groups.Rename(ctx, "fruit", "Fruit and veg"), "")
	if got := names(must[[]model.Group](t)(groups.List(ctx))); got != "DAIRY Fruit and veg" {
		t.Errorf("groups %q", got)
	}
}

func TestMoveGroup(t *testing.T) {
	tests := []struct {
		group    string
		position int
		want     string // the path after, or a piece of the error
	}{
		{"c", 1, "c a b d"},
		{"a", 4, "b c d a"},
		{"b", 3, "a c b d"},
		{"b", 2, "a b c d"},
		{"a", 0, "1 to 4"},
		{"a", 5, "1 to 4"},
		{"e", 1, "not found"},
	}
	for _, tt := range tests {
		t.Run(tt.group, func(t *testing.T) {
			ctx := context.Background()
			groups, _, _ := newServices(t)
			for _, n := range []string{"a", "b", "c", "d"} {
				must[model.Group](t)(groups.Add(ctx, n))
			}
			err := groups.Move(ctx, tt.group, tt.position)
			if err != nil {
				wantErr(t, err, tt.want)
				return
			}
			all := must[[]model.Group](t)(groups.List(ctx))
			if got := names(all); got != tt.want {
				t.Errorf("path %q, want %q", got, tt.want)
			}
			for i, g := range all {
				if g.Position != i+1 {
					t.Errorf("%s at position %d, want %d", g.Name, g.Position, i+1)
				}
			}
		})
	}
}

func TestRemoveGroup(t *testing.T) {
	ctx := context.Background()
	groups, items, _ := newServices(t)
	must[model.Group](t)(groups.Add(ctx, "Dairy"))
	must[model.Group](t)(groups.Add(ctx, "Fruit"))
	must[model.Item](t)(items.Add(ctx, "milk", model.UnitCount, "dairy"))

	wantErr(t, groups.Remove(ctx, "dairy"), "")
	wantErr(t, groups.Remove(ctx, "dairy"), "not found")
	if got := names(must[[]model.Group](t)(groups.List(ctx))); got != "Fruit" {
		t.Errorf("groups %q, want Fruit", got)
	}
	// unused, now ungrouped: gone with its group (decisions/0012)
	if all := must[[]model.Item](t)(items.List(ctx)); len(all) != 0 {
		t.Errorf("items %v, want none", all)
	}
	// a new group goes last, after the gap
	if g := must[model.Group](t)(groups.Add(ctx, "Bakery")); g.Position <= 2 {
		t.Errorf("Bakery at %d, want after Fruit", g.Position)
	}
	if got := names(must[[]model.Group](t)(groups.List(ctx))); got != "Fruit Bakery" {
		t.Errorf("groups %q", got)
	}
}
