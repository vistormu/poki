package service

import (
	"context"
	"slices"
	"strings"

	"poki/domain/model"
)

type GroupStore interface {
	// Groups are the live groups, in path order.
	Groups(ctx context.Context) ([]model.Group, error)
	// AddGroup puts a new group last on the path.
	AddGroup(ctx context.Context, id, name string) (model.Group, error)
	RenameGroup(ctx context.Context, id, name string) error
	// PlaceGroups numbers the groups 1… in the order of ids.
	PlaceGroups(ctx context.Context, ids []string) error
	// DeleteGroup deletes a group; its items lose it, and the unused ones go.
	DeleteGroup(ctx context.Context, id string) error
}

type Groups struct {
	store GroupStore
}

func NewGroups(store GroupStore) *Groups {
	return &Groups{store: store}
}

const maxGroupName = 24

func (s *Groups) List(ctx context.Context) ([]model.Group, error) {
	return s.store.Groups(ctx)
}

// Find is the group ref names: its id, its name or the start of its id.
func (s *Groups) Find(ctx context.Context, ref string) (model.Group, error) {
	all, err := s.store.Groups(ctx)
	if err != nil {
		return model.Group{}, err
	}
	return find(all, ref, "group", func(g model.Group) string { return g.ID }, func(g model.Group) string { return g.Name })
}

// Add makes a group, last on the path. names are unique, ignoring case.
func (s *Groups) Add(ctx context.Context, name string) (model.Group, error) {
	all, err := s.store.Groups(ctx)
	if err != nil {
		return model.Group{}, err
	}
	name, err = checkGroupName(all, "", name)
	if err != nil {
		return model.Group{}, err
	}
	return s.store.AddGroup(ctx, model.NewID(), name)
}

// Rename renames a group; its items stay in it.
func (s *Groups) Rename(ctx context.Context, ref, name string) error {
	all, err := s.store.Groups(ctx)
	if err != nil {
		return err
	}
	g, err := find(all, ref, "group", func(g model.Group) string { return g.ID }, func(g model.Group) string { return g.Name })
	if err != nil {
		return err
	}
	name, err = checkGroupName(all, g.ID, name)
	if err != nil {
		return err
	}
	return s.store.RenameGroup(ctx, g.ID, name)
}

// Move puts a group at a position on the path, 1 to the number of groups; the
// others close up around it.
func (s *Groups) Move(ctx context.Context, ref string, position int) error {
	all, err := s.store.Groups(ctx)
	if err != nil {
		return err
	}
	g, err := find(all, ref, "group", func(g model.Group) string { return g.ID }, func(g model.Group) string { return g.Name })
	if err != nil {
		return err
	}
	if position < 1 || position > len(all) {
		return model.Invalid("The position is 1 to %d", len(all))
	}
	ids := []string{}
	for _, o := range all {
		if o.ID != g.ID {
			ids = append(ids, o.ID)
		}
	}
	return s.store.PlaceGroups(ctx, slices.Insert(ids, position-1, g.ID))
}

// Remove deletes a group: its items go to Other, and those nothing uses go
// (decisions/0012).
func (s *Groups) Remove(ctx context.Context, ref string) error {
	g, err := s.Find(ctx, ref)
	if err != nil {
		return err
	}
	return s.store.DeleteGroup(ctx, g.ID)
}

// checkGroupName checks a name for the group id ("" for a new one) against
// the others.
func checkGroupName(all []model.Group, id, name string) (string, error) {
	name, err := checkName(name, "group", maxGroupName)
	if err != nil {
		return "", err
	}
	if strings.EqualFold(name, "Other") {
		return "", model.Invalid("Other is where items with no group are")
	}
	for _, g := range all {
		if g.ID != id && strings.EqualFold(g.Name, name) {
			return "", model.Invalid("Another group is already called “%s”", g.Name)
		}
	}
	return name, nil
}
