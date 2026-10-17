package model

import "testing"

func TestFormatAmount(t *testing.T) {
	n := func(f float64) *float64 { return &f }
	tests := []struct {
		amount *float64
		unit   string
		want   string
	}{
		{nil, UnitG, ""},
		{nil, UnitNone, ""},
		{n(200), UnitG, "200 g"},
		{n(6), UnitCount, "6"},
		{n(0.5), UnitCount, "0.5"},
		{n(0.1 + 0.2), UnitCount, "0.3"},
		{n(1.0 / 3), UnitCount, "0.33"},
		{n(1000), UnitG, "1000 g"},
		{n(12.5), UnitG, "12.5 g"},
	}
	for _, tt := range tests {
		if got := FormatAmount(tt.amount, tt.unit); got != tt.want {
			t.Errorf("FormatAmount(%v, %s) = %q, want %q", tt.amount, tt.unit, got, tt.want)
		}
	}
}
