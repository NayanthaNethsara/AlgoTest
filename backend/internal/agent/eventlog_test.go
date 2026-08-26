package agent

import (
	"encoding/json"
	"testing"
	"time"
)

func signalEntry(t *testing.T, at time.Time, eventType string, s Signals) Entry {
	t.Helper()
	payload, err := json.Marshal(s)
	if err != nil {
		t.Fatalf("marshal signals: %v", err)
	}
	return Entry{Kind: KindEvent, At: at, Label: eventType, Payload: payload}
}

func TestDescribeEventsNamesWhatChanged(t *testing.T) {
	base := time.Date(2026, 3, 1, 14, 0, 0, 0, time.UTC)

	// Newest first, the order Timeline returns.
	entries := []Entry{
		signalEntry(t, base.Add(2*time.Minute), eventSignalChange, Signals{
			ForegroundApp:     "com.google.Chrome",
			ForegroundDwell:   map[string]int64{"com.google.Chrome": 12_000, "ai.ollama": 3_000},
			InternetReachable: true,
			ProcessMatches:    []string{"ollama"},
		}),
		signalEntry(t, base.Add(1*time.Minute), eventSignalChange, Signals{
			ForegroundApp:   "com.microsoft.VSCode",
			ForegroundDwell: map[string]int64{"com.microsoft.VSCode": 15_000},
		}),
		signalEntry(t, base, eventBoot, Signals{
			ForegroundApp:   "com.microsoft.VSCode",
			ForegroundDwell: map[string]int64{"com.microsoft.VSCode": 15_000},
		}),
	}

	describeEvents(entries)

	if entries[2].Label != "Proctor client connected" {
		t.Errorf("boot label = %q", entries[2].Label)
	}
	if entries[2].Detail != "VSCode" {
		t.Errorf("boot detail = %q, want the standing state", entries[2].Detail)
	}
	// Identical signals: the hash moved for something the diff has no rule for, so
	// the row reports the standing state rather than inventing a change.
	if entries[1].Label != "Activity" || entries[1].Detail != "VSCode" {
		t.Errorf("diffless change = %q / %q", entries[1].Label, entries[1].Detail)
	}
	if entries[0].Label != "Switched to Chrome" {
		t.Errorf("headline = %q", entries[0].Label)
	}
	want := "opened ollama (3s) · Network reconnected (internet restored) · process ollama appeared"
	if entries[0].Detail != want {
		t.Errorf("detail = %q, want %q", entries[0].Detail, want)
	}
}

func TestDescribeEventsReportsPortsAppearingAndGoing(t *testing.T) {
	base := time.Date(2026, 3, 1, 14, 0, 0, 0, time.UTC)
	withPort := Signals{Ports: []PortMatch{{Port: 11434, RuleID: "ai.port.ollama", Product: "Ollama", Confirmed: true}}}

	entries := []Entry{
		signalEntry(t, base.Add(2*time.Minute), eventSignalChange, Signals{}),
		signalEntry(t, base.Add(1*time.Minute), eventSignalChange, withPort),
		signalEntry(t, base, eventSignalChange, Signals{}),
	}

	describeEvents(entries)

	if entries[1].Label != "Ollama on :11434 started answering" {
		t.Errorf("appearance = %q", entries[1].Label)
	}
	if entries[0].Label != "Ollama on :11434 stopped answering" {
		t.Errorf("disappearance = %q", entries[0].Label)
	}
}

func TestDescribeEventsRendersDisconnectAndStop(t *testing.T) {
	base := time.Date(2026, 3, 1, 14, 0, 0, 0, time.UTC)
	ended := base.Add(3 * time.Minute)

	entries := []Entry{
		{Kind: KindEvent, At: ended, Label: eventStopped, Detail: "contestant stopped proctoring"},
		{Kind: KindGap, At: base, EndedAt: &ended, Label: "agent_unreachable", Count: 192},
	}

	describeEvents(entries)

	if entries[0].Label != "Proctor client stopped" {
		t.Errorf("stop label = %q", entries[0].Label)
	}
	if entries[1].Label != "Blackout Disconnect Gap" {
		t.Errorf("gap label = %q", entries[1].Label)
	}
	if entries[1].Detail != "Offline for 3m 12s · Reconnected at 14:03:00" {
		t.Errorf("gap detail = %q", entries[1].Detail)
	}
}

func TestDescribeGapStillOpen(t *testing.T) {
	e := Entry{Kind: KindGap, At: time.Now(), Label: "agent_unreachable"}
	describeGap(&e)
	if e.Detail != "Proctor client went dark — currently offline / disconnected" {
		t.Errorf("open gap detail = %q", e.Detail)
	}
}

func TestAppNameFormatting(t *testing.T) {
	cases := []struct {
		input string
		want  string
	}{
		{"chrome.exe", "chrome"},
		{"Code.exe", "Code"},
		{"MiniAlgothon.exe", "MiniAlgothon"},
		{`C:\Program Files\Google\Chrome\Application\chrome.exe`, "chrome"},
		{`/usr/bin/google-chrome`, "google-chrome"},
		{"com.google.Chrome", "Chrome"},
		{"com.microsoft.VSCode", "VSCode"},
		{"ai.ollama", "ollama"},
		{"", ""},
	}

	for _, c := range cases {
		got := appName(c.input)
		if got != c.want {
			t.Errorf("appName(%q) = %q, want %q", c.input, got, c.want)
		}
	}
}
