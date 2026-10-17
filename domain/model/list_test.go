package model

import "testing"

func TestTotal(t *testing.T) {
	n := func(f float64) *float64 { return &f }
	e := func(a *float64) ListEntry { return ListEntry{Amount: a} }
	tests := []struct {
		name    string
		entries []ListEntry
		want    string // FormatAmount of the total, in grams
	}{
		{"none", nil, ""},
		{"one", []ListEntry{e(n(200))}, "200 g"},
		{"summed", []ListEntry{e(n(200)), e(n(125))}, "325 g"},
		{"an entry with no amount adds nothing", []ListEntry{e(n(200)), e(nil)}, "200 g"},
		{"no amounts: no total", []ListEntry{e(nil), e(nil)}, ""},
		{"fractions read clean", []ListEntry{e(n(0.1)), e(n(0.2))}, "0.3 g"},
		{"halves", []ListEntry{e(n(0.5)), e(n(0.5)), e(n(1))}, "2 g"},
	}
	for _, tt := range tests {
		if got := FormatAmount(Total(tt.entries), UnitG); got != tt.want {
			t.Errorf("%s: %q, want %q", tt.name, got, tt.want)
		}
	}
}
