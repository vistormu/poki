package service

import (
	"cmp"
	"context"
	"slices"
	"strings"

	"poki/domain/model"
)

type ListStore interface {
	// ListEntries are the live list entries, in no order.
	ListEntries(ctx context.Context) ([]model.ListEntry, error)
	// ListEntryMeals are the meal names of the entries marks made, by entry id.
	ListEntryMeals(ctx context.Context) (map[string]string, error)
	AddListEntry(ctx context.Context, e model.ListEntry) error
	SetListEntriesState(ctx context.Context, ids []string, state string) error
	// DeleteListEntry deletes an entry; its item goes if nothing else keeps it.
	DeleteListEntry(ctx context.Context, id string) error
	// ClearList deletes every entry.
	ClearList(ctx context.Context) error
}

type List struct {
	store ListStore
	items *Items
}

func NewList(store ListStore, items *Items) *List {
	return &List{store: store, items: items}
}

// Sheet is the list as it reads (spec → list): the ? entries one by one, the
// items to buy by group in path order (Other last), the bought ones apart.
type Sheet struct {
	Check  []Check // by item name, then meal
	Groups []Shelf // only the groups with something to buy
	Bought []Row   // in path order
}

// Check is one ? entry, with the meal whose mark made it ("" if added by hand).
type Check struct {
	model.ListEntry
	Item model.Item
	Meal string
}

// Shelf is a group's items to buy. Group.ID "" is Other.
type Shelf struct {
	Group model.Group
	Rows  []Row // by item name
}

// Row is one item in one state, its entries summed.
type Row struct {
	Item    model.Item
	Total   *float64 // model.Total of Entries
	Entries []model.ListEntry
}

func (s *List) Show(ctx context.Context) (Sheet, error) {
	entries, err := s.store.ListEntries(ctx)
	if err != nil {
		return Sheet{}, err
	}
	meals, err := s.store.ListEntryMeals(ctx)
	if err != nil {
		return Sheet{}, err
	}
	items, err := s.items.List(ctx) // path order
	if err != nil {
		return Sheet{}, err
	}
	groups, err := s.items.groups.List(ctx)
	if err != nil {
		return Sheet{}, err
	}

	byItem := map[string][]model.ListEntry{}
	var sheet Sheet
	for _, e := range entries {
		byItem[e.ItemID] = append(byItem[e.ItemID], e)
	}
	shelves := map[string]*Shelf{}
	for _, it := range items {
		var buy, bought []model.ListEntry
		for _, e := range byItem[it.ID] {
			switch e.State {
			case model.StateCheck:
				sheet.Check = append(sheet.Check, Check{ListEntry: e, Item: it, Meal: meals[e.ID]})
			case model.StateBuy:
				buy = append(buy, e)
			case model.StateBought:
				bought = append(bought, e)
			}
		}
		if len(buy) > 0 {
			if shelves[it.GroupID] == nil {
				shelves[it.GroupID] = &Shelf{Group: model.Group{ID: it.GroupID, Name: "Other"}}
			}
			shelves[it.GroupID].Rows = append(shelves[it.GroupID].Rows, Row{Item: it, Total: model.Total(buy), Entries: buy})
		}
		if len(bought) > 0 {
			sheet.Bought = append(sheet.Bought, Row{Item: it, Total: model.Total(bought), Entries: bought})
		}
	}
	for _, g := range append(groups, model.Group{Name: "Other"}) {
		if sh := shelves[g.ID]; sh != nil {
			sh.Group = g
			sheet.Groups = append(sheet.Groups, *sh)
		}
	}
	slices.SortStableFunc(sheet.Check, func(a, b Check) int {
		return cmp.Or(cmp.Compare(strings.ToLower(a.Item.Name), strings.ToLower(b.Item.Name)), cmp.Compare(a.Meal, b.Meal))
	})
	return sheet, nil
}

// Add puts an item on the list by hand, to buy, with an optional amount in its
// unit.
func (s *List) Add(ctx context.Context, itemRef string, amount *float64) error {
	it, err := s.items.Find(ctx, itemRef)
	if err != nil {
		return err
	}
	if err := checkAmount(it, amount); err != nil {
		return err
	}
	return s.store.AddListEntry(ctx, model.ListEntry{ID: model.NewID(), ItemID: it.ID, Amount: amount, State: model.StateBuy})
}

// Resolve settles a ? entry: buy puts it to buy, have takes it off the list.
// ref is the entry's id, or its item when one ? entry has it.
func (s *List) Resolve(ctx context.Context, ref, to string) error {
	sheet, err := s.Show(ctx)
	if err != nil {
		return err
	}
	c, err := find(sheet.Check, ref, "? entry", func(c Check) string { return c.ID }, func(c Check) string { return c.Item.Name })
	if err != nil {
		return err
	}
	switch to {
	case model.StateBuy:
		return s.store.SetListEntriesState(ctx, []string{c.ID}, model.StateBuy)
	case "have":
		return s.store.DeleteListEntry(ctx, c.ID)
	}
	return model.Invalid("A ? item is settled buy or have")
}

// Tick marks an item to buy bought: all its entries, as its row is one.
func (s *List) Tick(ctx context.Context, itemRef string) error {
	return s.move(ctx, itemRef, model.StateBuy, model.StateBought)
}

// Untick puts a bought item back to buy.
func (s *List) Untick(ctx context.Context, itemRef string) error {
	return s.move(ctx, itemRef, model.StateBought, model.StateBuy)
}

func (s *List) move(ctx context.Context, itemRef, from, to string) error {
	it, err := s.items.Find(ctx, itemRef)
	if err != nil {
		return err
	}
	entries, err := s.store.ListEntries(ctx)
	if err != nil {
		return err
	}
	var ids []string
	for _, e := range entries {
		if e.ItemID == it.ID && e.State == from {
			ids = append(ids, e.ID)
		}
	}
	if len(ids) == 0 {
		if from == model.StateBuy {
			return model.Invalid("%s is not to buy", it.Name)
		}
		return model.Invalid("%s is not bought", it.Name)
	}
	return s.store.SetListEntriesState(ctx, ids, to)
}

// Clear empties the list, whatever the state: the reset for the next planning.
func (s *List) Clear(ctx context.Context) error {
	return s.store.ClearList(ctx)
}
