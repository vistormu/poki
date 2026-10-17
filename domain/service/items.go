package service

import (
	"cmp"
	"context"
	"errors"
	"slices"
	"strings"

	"poki/domain/model"
)

type ItemStore interface {
	// Items are the live items, in no order.
	Items(ctx context.Context) ([]model.Item, error)
	AddItem(ctx context.Context, it model.Item) error
	// UpdateItem sets an item's name, unit and group; an item left with no
	// group and no use goes.
	UpdateItem(ctx context.Context, it model.Item) error
	// DeleteItem fails with model.ErrInUse while a meal or the list uses it.
	DeleteItem(ctx context.Context, id string) error
}

type Items struct {
	store  ItemStore
	groups *Groups
}

func NewItems(store ItemStore, groups *Groups) *Items {
	return &Items{store: store, groups: groups}
}

const maxItemName = 40

// List is every item, in path order: by group, Other last, then by name.
func (s *Items) List(ctx context.Context) ([]model.Item, error) {
	items, err := s.store.Items(ctx)
	if err != nil {
		return nil, err
	}
	groups, err := s.groups.List(ctx)
	if err != nil {
		return nil, err
	}
	position := map[string]int{"": len(groups) + 1}
	for _, g := range groups {
		position[g.ID] = g.Position
	}
	slices.SortFunc(items, func(a, b model.Item) int {
		return cmp.Or(cmp.Compare(position[a.GroupID], position[b.GroupID]),
			cmp.Compare(strings.ToLower(a.Name), strings.ToLower(b.Name)))
	})
	return items, nil
}

// Find is the item ref names: its id, its name or the start of its id.
func (s *Items) Find(ctx context.Context, ref string) (model.Item, error) {
	all, err := s.store.Items(ctx)
	if err != nil {
		return model.Item{}, err
	}
	return find(all, ref, "item", func(it model.Item) string { return it.ID }, func(it model.Item) string { return it.Name })
}

// Add makes an item. groupRef is "" for none (Other). names are unique,
// ignoring case: the picker would have offered the one we have.
func (s *Items) Add(ctx context.Context, name, unit, groupRef string) (model.Item, error) {
	it := model.Item{ID: model.NewID(), Name: name, Unit: unit}
	if groupRef != "" {
		g, err := s.groups.Find(ctx, groupRef)
		if err != nil {
			return model.Item{}, err
		}
		it.GroupID = g.ID
	}
	it, err := s.check(ctx, it)
	if err != nil {
		return model.Item{}, err
	}
	return it, s.store.AddItem(ctx, it)
}

// Group gives an item its group; groupRef "" sends it to Other, and it goes if
// nothing uses it.
func (s *Items) Group(ctx context.Context, ref, groupRef string) error {
	it, err := s.Find(ctx, ref)
	if err != nil {
		return err
	}
	it.GroupID = ""
	if groupRef != "" {
		g, err := s.groups.Find(ctx, groupRef)
		if err != nil {
			return err
		}
		it.GroupID = g.ID
	}
	return s.store.UpdateItem(ctx, it)
}

// Edit renames an item or changes its unit: the terminal's way out for typos
// (decisions/0012). nil leaves a field as it is. a new unit reinterprets the
// item's amounts, unconverted (decisions/0005).
func (s *Items) Edit(ctx context.Context, ref string, name, unit *string) (model.Item, error) {
	it, err := s.Find(ctx, ref)
	if err != nil {
		return model.Item{}, err
	}
	if name != nil {
		it.Name = *name
	}
	if unit != nil {
		it.Unit = *unit
	}
	if it, err = s.check(ctx, it); err != nil {
		return model.Item{}, err
	}
	return it, s.store.UpdateItem(ctx, it)
}

// Remove deletes an item nothing uses.
func (s *Items) Remove(ctx context.Context, ref string) error {
	it, err := s.Find(ctx, ref)
	if err != nil {
		return err
	}
	err = s.store.DeleteItem(ctx, it.ID)
	if errors.Is(err, model.ErrInUse) {
		return model.Invalid("A meal or the list uses “%s”", it.Name)
	}
	return err
}

func (s *Items) check(ctx context.Context, it model.Item) (model.Item, error) {
	name, err := checkName(it.Name, "item", maxItemName)
	if err != nil {
		return model.Item{}, err
	}
	it.Name = name
	if !model.IsUnit(it.Unit) {
		return model.Item{}, model.Invalid("The unit is one of %s", strings.Join(model.Units, ", "))
	}
	all, err := s.store.Items(ctx)
	if err != nil {
		return model.Item{}, err
	}
	for _, o := range all {
		if o.ID != it.ID && strings.EqualFold(o.Name, name) {
			return model.Item{}, model.Invalid("There is already an item called “%s”", o.Name)
		}
	}
	return it, nil
}
