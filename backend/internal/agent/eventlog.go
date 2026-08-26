package agent

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"
)

// Raw event_type values written by Service.Heartbeat and the sweeper. They are
// stored, not displayed: a reviewer scrolling a timeline needs "opened Chrome",
// not "signal_change".
const (
	eventBoot         = "boot"
	eventSignalChange = "signal_change"
	eventKeepalive    = "keepalive"
	eventBuffered     = "buffered"
	eventStopped      = "agent_stopped"
)

// describeEvents rewrites raw telemetry rows into the log an organizer reads.
//
// The agent reports whole signal sets rather than diffs, so what changed only
// exists as the difference between one row and the row before it. That difference
// is computed here, once, on the way out: storing prose instead would make the
// evidence unre-interpretable when a rule changes, and computing it in the browser
// would put it out of reach of every other consumer of the timeline.
//
// Entries arrive newest-first, so the walk runs backwards. The oldest row in the
// window has no predecessor and is described as a standing state rather than as a
// change, which is honest about the fact that the LIMIT, not the endpoint, is why
// nothing appears to have happened before it.
func describeEvents(entries []Entry) {
	var prev *Signals

	for i := len(entries) - 1; i >= 0; i-- {
		e := &entries[i]

		switch e.Kind {
		case KindGap:
			describeGap(e)
			continue
		case KindEvent:
		default:
			continue
		}

		eventType := e.Label
		if eventType == eventStopped {
			e.Label = "Proctor client stopped"
			if e.Detail == "" {
				e.Detail = "contestant stopped proctoring"
			}
			continue
		}

		var cur Signals
		hasSignals := len(e.Payload) > 0 && json.Unmarshal(e.Payload, &cur) == nil

		switch eventType {
		case eventBoot:
			e.Label = "Proctor client connected"
		case eventBuffered:
			e.Label = "Backfilled while offline"
		case eventKeepalive:
			e.Label = "Still reporting"
		case eventSignalChange:
			e.Label = "Activity"
		default:
			e.Label = eventType
		}

		if !hasSignals {
			continue
		}

		changes := diffSignals(prev, cur)
		if eventType == eventSignalChange && len(changes) > 0 {
			// The first change is the headline, so a scan down the left edge reads as
			// a story rather than as a column of identical words.
			e.Label = capitalize(changes[0])
			e.Detail = strings.Join(changes[1:], " · ")
		} else if len(changes) > 0 {
			e.Detail = strings.Join(changes, " · ")
		} else {
			e.Detail = stateSummary(cur)
		}

		snapshot := cur
		prev = &snapshot
	}
}

// describeGap turns a blackout row into the pair of facts a reviewer wants: that
// the client went dark, and whether it ever came back.
func describeGap(e *Entry) {
	reason := e.Label
	e.Label = "Proctor client disconnected"
	if reason != "" && reason != "agent_unreachable" {
		e.Label = fmt.Sprintf("Proctor client disconnected (%s)", reason)
	}

	if e.EndedAt == nil {
		e.Detail = "still dark"
		return
	}
	e.Detail = fmt.Sprintf("dark for %s, reconnected %s",
		humanSeconds(e.Count), e.EndedAt.Format("15:04:05"))
}

// diffSignals names every observable difference between two consecutive reports,
// most-significant first. A nil previous means this is the first row in the window,
// where there is no change to report and the standing state is the useful answer.
func diffSignals(prev *Signals, cur Signals) []string {
	if prev == nil {
		return nil
	}

	var changes []string

	if cur.ForegroundApp != "" && cur.ForegroundApp != prev.ForegroundApp {
		changes = append(changes, fmt.Sprintf("switched to %s", appName(cur.ForegroundApp)))
	}

	// Dwell is drained every heartbeat, so a key present now and absent before is an
	// application the contestant brought to the front during this window.
	for _, app := range added(dwellKeys(prev.ForegroundDwell), dwellKeys(cur.ForegroundDwell)) {
		if app == cur.ForegroundApp {
			continue
		}
		changes = append(changes, fmt.Sprintf("opened %s (%s)", appName(app), humanMillis(cur.ForegroundDwell[app])))
	}

	if cur.InternetReachable != prev.InternetReachable {
		if cur.InternetReachable {
			changes = append(changes, "internet became reachable")
		} else {
			changes = append(changes, "internet no longer reachable")
		}
	}

	prevPorts, curPorts := portLabels(prev.Ports), portLabels(cur.Ports)
	for _, p := range addedKeys(prevPorts, curPorts) {
		changes = append(changes, fmt.Sprintf("%s started answering", curPorts[p]))
	}
	for _, p := range addedKeys(curPorts, prevPorts) {
		changes = append(changes, fmt.Sprintf("%s stopped answering", prevPorts[p]))
	}

	for _, proc := range added(prev.ProcessMatches, cur.ProcessMatches) {
		changes = append(changes, fmt.Sprintf("process %s appeared", proc))
	}
	for _, proc := range added(cur.ProcessMatches, prev.ProcessMatches) {
		changes = append(changes, fmt.Sprintf("process %s exited", proc))
	}

	return changes
}

// stateSummary describes a report that changed nothing, which is what a keepalive
// is. Without it a quiet hour reads as an unbroken column of "Still reporting" with
// no way to tell what the contestant was actually doing.
func stateSummary(s Signals) string {
	parts := []string{}
	if s.ForegroundApp != "" {
		parts = append(parts, appName(s.ForegroundApp))
	}
	if s.InternetReachable {
		parts = append(parts, "internet reachable")
	}
	for _, p := range s.Ports {
		if p.Confirmed {
			parts = append(parts, fmt.Sprintf("%s :%d", p.Product, p.Port))
		}
	}
	if len(s.ProcessMatches) > 0 {
		parts = append(parts, strings.Join(s.ProcessMatches, ", "))
	}
	return strings.Join(parts, " · ")
}

func appName(id string) string {
	if id == "" {
		return ""
	}

	if i := strings.LastIndexAny(id, `/\`); i >= 0 && i < len(id)-1 {
		id = id[i+1:]
	}

	lower := strings.ToLower(id)
	if strings.HasSuffix(lower, ".exe") || strings.HasSuffix(lower, ".app") {
		id = id[:len(id)-4]
	}

	if strings.Contains(id, ".") {
		if i := strings.LastIndex(id, "."); i >= 0 && i < len(id)-1 {
			id = id[i+1:]
		}
	}

	return id
}

func portLabels(ports []PortMatch) map[string]string {
	labels := map[string]string{}
	for _, p := range ports {
		if !p.Confirmed {
			continue
		}
		key := fmt.Sprintf("%s:%d", p.RuleID, p.Port)
		product := p.Product
		if product == "" {
			product = p.RuleID
		}
		labels[key] = fmt.Sprintf("%s on :%d", product, p.Port)
	}
	return labels
}

func dwellKeys(dwell map[string]int64) []string {
	keys := make([]string, 0, len(dwell))
	for k := range dwell {
		keys = append(keys, k)
	}
	return keys
}

// added returns what is in next but not in base, ordered so two renderings of the
// same pair of reports read identically.
func added(base, next []string) []string {
	seen := make(map[string]struct{}, len(base))
	for _, b := range base {
		seen[b] = struct{}{}
	}
	var out []string
	for _, n := range next {
		if _, ok := seen[n]; !ok {
			out = append(out, n)
		}
	}
	sort.Strings(out)
	return out
}

func addedKeys(base, next map[string]string) []string {
	var out []string
	for k := range next {
		if _, ok := base[k]; !ok {
			out = append(out, k)
		}
	}
	sort.Strings(out)
	return out
}

func humanMillis(ms int64) string {
	return humanSeconds(int(time.Duration(ms) * time.Millisecond / time.Second))
}

func humanSeconds(seconds int) string {
	if seconds < 60 {
		if seconds < 1 {
			seconds = 1
		}
		return fmt.Sprintf("%ds", seconds)
	}
	if seconds < 3600 {
		return fmt.Sprintf("%dm %ds", seconds/60, seconds%60)
	}
	return fmt.Sprintf("%dh %dm", seconds/3600, (seconds%3600)/60)
}

func capitalize(s string) string {
	if s == "" {
		return s
	}
	return strings.ToUpper(s[:1]) + s[1:]
}
