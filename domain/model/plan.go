package model

import (
	"slices"
	"time"
)

// PlanEntry is a meal placed on a day. a slot holds meals in Position order,
// or one NoMeal, or nothing yet (decisions/0008).
type PlanEntry struct {
	ID       string `db:"id"`
	Date     string `db:"date"` // the phone's local date, DateLayout
	Slot     string `db:"slot"` // one of Slots
	MealID   string `db:"meal_id"`
	Position int    `db:"position"`
}

const (
	SlotLunch  = "lunch"
	SlotDinner = "dinner"
)

// Slots are a day's slots, in the day's order.
var Slots = []string{SlotLunch, SlotDinner}

func IsSlot(s string) bool { return slices.Contains(Slots, s) }

// DateLayout is how dates are written everywhere: 2026-10-17.
const DateLayout = time.DateOnly

func IsDate(s string) bool {
	_, err := time.Parse(DateLayout, s)
	return err == nil
}
