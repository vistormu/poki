package cmd

import "testing"

func TestParseAmount(t *testing.T) {
	tests := []struct {
		in   string
		want float64
		ok   bool
	}{
		{"200", 200, true},
		{"0.5", 0.5, true},
		{"0,5", 0.5, true},
		{"1/2", 0.5, true},
		{" 1/4 ", 0.25, true},
		{"1/0", 0, false},
		{"half", 0, false},
		{"200g", 0, false},
		{"", 0, false},
	}
	for _, tt := range tests {
		got, err := parseAmount(tt.in)
		if (err == nil) != tt.ok || got != tt.want {
			t.Errorf("parseAmount(%q) = %v, %v; want %v, ok %v", tt.in, got, err, tt.want, tt.ok)
		}
	}
}
