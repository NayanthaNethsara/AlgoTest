package api

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"

	"github.com/NayanthaNethsara/mini-algothon/backend/internal/telemetry"
)

func TestParseMonitoringSections(t *testing.T) {
	tests := []struct {
		name    string
		include string
		want    []string
	}{
		{"empty means everything", "", monitoringSections},
		{"subset", "overview,telemetry", []string{"overview", "telemetry"}},
		{"whitespace is tolerated", " risk , agents ", []string{"risk", "agents"}},
		{"canonical order, not the caller's", "agents,overview", []string{"overview", "agents"}},
		{"unknown names are dropped", "overview,submissions", []string{"overview"}},
		{"nothing recognisable means everything", "submissions,teams", monitoringSections},
		{"duplicates collapse", "risk,risk", []string{"risk"}},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := parseMonitoringSections(tc.include); !reflect.DeepEqual(got, tc.want) {
				t.Fatalf("parseMonitoringSections(%q) = %v, want %v", tc.include, got, tc.want)
			}
		})
	}
}

// The console keeps whatever it already has for a section the response omits,
// and clears the table for one that comes back empty. Collapsing the two would
// leave contestants on screen who are no longer in the result set.
func TestMonitoringSnapshotDistinguishesAbsentFromEmpty(t *testing.T) {
	empty := []telemetry.Heartbeat{}
	body, err := json.Marshal(monitoringSnapshot{
		Telemetry: &empty,
		Errors:    map[string]string{},
	})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	encoded := string(body)
	if !strings.Contains(encoded, `"telemetry":[]`) {
		t.Fatalf("an empty telemetry section must be sent as [], got %s", encoded)
	}
	for _, absent := range []string{"overview", "risk", "agents", "incidentOpen"} {
		if strings.Contains(encoded, `"`+absent+`"`) {
			t.Fatalf("section %q was not requested and must be absent, got %s", absent, encoded)
		}
	}
	if !strings.Contains(encoded, `"errors":{}`) {
		t.Fatalf("errors must always be present so the client can read it, got %s", encoded)
	}
}
