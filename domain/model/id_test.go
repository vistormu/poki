package model

import (
	"regexp"
	"testing"
)

func TestNewID(t *testing.T) {
	v4 := regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)
	seen := map[string]bool{}
	for range 100 {
		id := NewID()
		if !v4.MatchString(id) {
			t.Fatalf("%q is not a v4 uuid", id)
		}
		if seen[id] {
			t.Fatalf("%q twice", id)
		}
		seen[id] = true
	}
}
