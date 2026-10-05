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
		{"Ва\u200bся", "Вася", true},                 // zero-width space
		{"\u202eасяВ", "асяВ", true},                 // right-to-left override
		{"\u200b\u2066", "", false},                  // nothing visible left
		{"👨\u200d👩\u200d👧", "👨\u200d👩\u200d👧", true}, // emoji family keeps its joiners
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

func TestValidRoomCode(t *testing.T) {
	for code, want := range map[string]bool{
		"ABC234":  true,
		"ZZ9988":  true,
		"ABC23":   false, // too short
		"ABC2345": false,
		"ABC10O":  false, // look-alikes are never issued
		"abc234":  false, // must be normalized first
		"AB C23":  false,
		"АВС234":  false, // Cyrillic look-alikes
		"":        false,
	} {
		if got := ValidRoomCode(code); got != want {
			t.Errorf("ValidRoomCode(%q) = %v, want %v", code, got, want)
		}
	}
}
