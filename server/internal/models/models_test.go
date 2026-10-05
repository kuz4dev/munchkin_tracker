package models

import (
	"strings"
	"testing"
)

func TestNormalizeName(t *testing.T) {
	cases := []struct {
		in, want string
		ok       bool
	}{
		{"  Alice  ", "Alice", true},
		{"Ал\x00иса\n", "Алиса", true},
		{strings.Repeat("я", MaxNameLength), strings.Repeat("я", MaxNameLength), true},
		{strings.Repeat("я", MaxNameLength+1), "", false},
		{"   ", "", false},
		{"", "", false},
	}
	for _, c := range cases {
		got, err := NormalizeName(c.in)
		if (err == nil) != c.ok || got != c.want {
			t.Errorf("NormalizeName(%q) = %q, %v", c.in, got, err)
		}
	}
}

func TestStatsValidate(t *testing.T) {
	if err := DefaultStats().Validate(); err != nil {
		t.Errorf("default stats should be valid: %v", err)
	}
	s := DefaultStats()
	s.Class = "bard"
	if s.Validate() == nil {
		t.Error("unknown class should be rejected")
	}
	s = DefaultStats()
	s.Gender = ""
	if s.Validate() == nil {
		t.Error("empty gender should be rejected")
	}
}
