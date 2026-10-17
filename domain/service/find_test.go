package service

import (
	"errors"
	"testing"

	"poki/domain/model"
)

func TestFind(t *testing.T) {
	all := []model.Group{
		{ID: "3f2a9c1e-0000", Name: "Dairy"},
		{ID: "3f2b0000-0000", Name: "Fruit"},
		{ID: "9a000000-0000", Name: "fruit"},
	}
	tests := []struct {
		ref, want, err string
	}{
		{"3f2a9c1e-0000", "Dairy", ""},
		{"dairy", "Dairy", ""},
		{"  DAIRY ", "Dairy", ""},
		{"3f2a", "Dairy", ""},
		{"3F2A", "Dairy", ""},
		{"9a000000-0000", "fruit", ""}, // an id beats a shared name
		{"fruit", "", "2 groups are called “fruit”: use the id"},
		{"3f2", "", "not found"}, // too short to be an id
		{"3f2", "", "not found"},
		{"3f", "", "not found"},
		{"bakery", "", "not found"},
	}
	for _, tt := range tests {
		t.Run(tt.ref, func(t *testing.T) {
			g, err := find(all, tt.ref, "group", func(g model.Group) string { return g.ID }, func(g model.Group) string { return g.Name })
			wantErr(t, err, tt.err)
			if tt.err == "not found" && !errors.Is(err, model.ErrNotFound) {
				t.Errorf("err = %v, want ErrNotFound", err)
			}
			if g.Name != tt.want {
				t.Errorf("found %q, want %q", g.Name, tt.want)
			}
		})
	}

	two := []model.Group{{ID: "3f2a0000-1", Name: "a"}, {ID: "3f2a0000-2", Name: "b"}}
	_, err := find(two, "3f2a", "group", func(g model.Group) string { return g.ID }, func(g model.Group) string { return g.Name })
	wantErr(t, err, "more than one group's id starts with 3f2a")
}
