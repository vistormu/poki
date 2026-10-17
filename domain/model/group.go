package model

// Group is a stretch of the store. Position is its place on our path,
// ascending from 1, so the list reads in the order we walk.
type Group struct {
	ID       string `db:"id"`
	Name     string `db:"name"`
	Position int    `db:"position"`
}
