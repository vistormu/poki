package model

// ListEntry is one addition to the list. with a PlanEntryID it is the mark of
// one of that planned meal's ingredients (decisions/0009); without, it was
// added by hand.
type ListEntry struct {
	ID          string   `db:"id"`
	ItemID      string   `db:"item_id"`
	Amount      *float64 `db:"amount"`
	PlanEntryID string   `db:"plan_entry_id"` // "" for added by hand
	State       string   `db:"state"`         // one of States
}

const (
	StateCheck  = "check" // ?: we don't know if we have it
	StateBuy    = "buy"
	StateBought = "bought"
)

// MarkNone is an ingredient with no list entry: we have it.
const MarkNone = "none"

// Marks are what an ingredient of a planned meal can be marked.
var Marks = []string{StateBuy, StateCheck, MarkNone}

// Total is the sum of the entries' amounts, for one item and state (the list's
// row): nil when none has an amount, as for `none` items. an entry with no
// amount adds nothing (decisions/0005: one unit, a plain sum).
func Total(entries []ListEntry) *float64 {
	var sum float64
	has := false
	for _, e := range entries {
		if e.Amount != nil {
			sum += *e.Amount
			has = true
		}
	}
	if !has {
		return nil
	}
	return &sum
}
