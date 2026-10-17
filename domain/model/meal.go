package model

import (
	"strconv"
	"strings"
)

// Meal is a dish we cook. no steps, no servings, no category.
type Meal struct {
	ID   string `db:"id"`
	Name string `db:"name"`
}

// NoMeal is the reserved meal of a slot left empty on purpose: no ingredients,
// never edited, hidden from the meals (decisions/0008).
const NoMeal = "00000000-0000-0000-0000-000000000000"

// Ingredient is an item a meal uses, with its amount in the item's unit.
type Ingredient struct {
	ID     string   `db:"id"`
	MealID string   `db:"meal_id"`
	ItemID string   `db:"item_id"`
	Amount *float64 `db:"amount"` // nil: no amount; always nil for UnitNone
}

// FormatAmount says an amount as the terminal and the list show it: "200 g",
// "6", "0.5"; "" for none. it is rounded to two decimals, so sums of fractions
// read clean.
func FormatAmount(amount *float64, unit string) string {
	if amount == nil {
		return ""
	}
	s := strconv.FormatFloat(*amount, 'f', 2, 64)
	s = strings.TrimRight(strings.TrimRight(s, "0"), ".")
	if unit == UnitG {
		s += " g"
	}
	return s
}
