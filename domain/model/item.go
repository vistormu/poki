package model

import "slices"

// Item is anything we buy. it lives while it has a group or something uses it
// (decisions/0012).
type Item struct {
	ID      string `db:"id"`
	Name    string `db:"name"`
	Unit    string `db:"unit"`     // one of Units, fixed per item (decisions/0005)
	GroupID string `db:"group_id"` // "" is no group: Other, last on the path
}

const (
	UnitG     = "g"
	UnitCount = "count"
	UnitNone  = "none" // no useful amount: salt, oil
)

var Units = []string{UnitG, UnitCount, UnitNone}

func IsUnit(u string) bool { return slices.Contains(Units, u) }
