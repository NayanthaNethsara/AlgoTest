// proctorsim drives the real proctoring API as one or more fake agents so you can
// watch a cheating attempt land in the admin monitoring view before contest day.
//
//	go run ./cmd/proctorsim -list
//	go run ./cmd/proctorsim -scenario local-llm -user alice -pass secret
//	go run ./cmd/proctorsim -scenario blackout  -user alice -pass secret -admin admin -admin-pass s3cret
//	go run ./cmd/proctorsim -scenario fleet-outage -users competitors.csv
//	go run ./cmd/proctorsim -scenario all -user alice -pass secret -admin admin -admin-pass s3cret
//
// It speaks only HTTP, exactly as the real client does: nothing is inserted
// straight into the database, so what you see in the UI is what a real endpoint
// would have produced. With -admin credentials it also reads the findings back and
// prints them, so a scenario proves itself without you hunting through the UI.
package main

import (
	"bytes"
	"crypto/rand"
	"encoding/csv"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"sort"
	"strings"
	"time"
)

const defaultAPI = "http://localhost:8080"

type scenario struct {
	name    string
	summary string
	expect  string
	run     func(*sim, *fakeAgent) error
}

func scenarios() []scenario {
	return []scenario{
		{
			name:    "clean",
			summary: "A normal contestant: desktop shell, no AI, no internet.",
			expect:  "No findings. Risk stays LOW and the Live tab shows ONLINE / DESKTOP SHELL.",
			run: func(s *sim, a *fakeAgent) error {
				for i := 0; i < 4; i++ {
					if err := a.beat(s, func(sig *signals) { sig.ForegroundApp = "com.microsoft.VSCode" }); err != nil {
						return err
					}
				}
				return nil
			},
		},
		{
			name:    "local-llm",
			summary: "Ollama starts mid-contest: process match plus a fingerprinted port.",
			expect:  "ai.proc.denylist (30) and ai.port.ollama (40) open, occurrences climbing, risk HIGH.",
			run: func(s *sim, a *fakeAgent) error {
				if err := a.beat(s, nil); err != nil {
					return err
				}
				s.step("ollama appears on the endpoint")
				for i := 0; i < 3; i++ {
					if err := a.beat(s, withOllama); err != nil {
						return err
					}
				}
				return nil
			},
		},
		{
			name:    "tethered",
			summary: "A phone hotspot gives the machine a second route to the internet.",
			expect:  "net.internet (50) opens — dispositive on an air gap.",
			run: func(s *sim, a *fakeAgent) error {
				if err := a.beat(s, nil); err != nil {
					return err
				}
				s.step("phone tethering brings the public internet into reach")
				for i := 0; i < 3; i++ {
					if err := a.beat(s, func(sig *signals) { sig.InternetReachable = true }); err != nil {
						return err
					}
				}
				return nil
			},
		},
		{
			name:    "blackout",
			summary: "Unplug, use a local model unobserved, plug back in.",
			expect:  "Nothing arrives during the blackout, then the buffered flush lands the evidence at its ORIGINAL timestamps. This is the property that makes disconnecting pointless.",
			run: func(s *sim, a *fakeAgent) error {
				if err := a.beat(s, nil); err != nil {
					return err
				}

				s.step("network unplugged — the agent buffers instead of sending")
				held := []heartbeat{}
				for i := 0; i < 4; i++ {
					hb := a.next(func(sig *signals) {
						sig.InternetReachable = true
						withOllama(sig)
					})
					hb.Buffered = true
					// Stamp them into the past, as a real buffer would.
					hb.WallTS = time.Now().UTC().Add(time.Duration(-(4 - i)) * time.Minute).Format(time.RFC3339Nano)
					held = append(held, hb)
					s.detail("  held report seq=%d at %s", hb.Seq, hb.WallTS[11:19])
				}

				s.step("network back — flushing %d held reports", len(held))
				if err := a.flush(s, held); err != nil {
					return err
				}
				return a.beat(s, nil)
			},
		},
		{
			name:    "replay",
			summary: "A captured heartbeat is replayed to fake liveness.",
			expect:  "Server answers 409 SEQ_REPLAY and opens tel.seq_replay (60). The heartbeat is refused, so it cannot hold the gate open.",
			run: func(s *sim, a *fakeAgent) error {
				if err := a.beat(s, nil); err != nil {
					return err
				}
				if err := a.beat(s, nil); err != nil {
					return err
				}

				s.step("replaying an older sequence number within the same boot")
				replay := a.next(nil)
				replay.Seq = 1
				status, body := a.post(s, "/api/v1/agent/heartbeat", replay)
				s.detail("  server said %d %s", status, strings.TrimSpace(body))
				if status != http.StatusConflict {
					return fmt.Errorf("expected 409 for a replayed sequence, got %d", status)
				}
				return nil
			},
		},
		{
			name:    "rebind",
			summary: "Agent runs on a clean laptop, then re-enrols from a second machine.",
			expect:  "tel.agent_rebound (30) and the first enrolment is revoked. The Agents tab shows two enrolments for one contestant.",
			run: func(s *sim, a *fakeAgent) error {
				if err := a.beat(s, nil); err != nil {
					return err
				}

				s.step("enrolling the same contestant from a different machine")
				second := &fakeAgent{user: a.user, pass: a.pass, machineID: randomHex(16)}
				if err := second.enroll(s); err != nil {
					return err
				}
				if err := second.beat(s, nil); err != nil {
					return err
				}

				s.step("the original agent's token should now be dead")
				status, body := a.post(s, "/api/v1/agent/heartbeat", a.next(nil))
				s.detail("  old token got %d %s", status, strings.TrimSpace(body))
				if status != http.StatusGone && status != http.StatusUnauthorized {
					return fmt.Errorf("expected the superseded token to be rejected, got %d", status)
				}
				return nil
			},
		},
		{
			name:    "clock-jump",
			summary: "The endpoint clock is moved during the contest.",
			expect:  "tel.clock_skew (20). A steadily wrong clock is ignored; only a change counts.",
			run: func(s *sim, a *fakeAgent) error {
				for i := 0; i < 2; i++ {
					if err := a.beat(s, nil); err != nil {
						return err
					}
				}
				s.step("wall clock jumps forward 10 minutes")
				hb := a.next(nil)
				hb.WallTS = time.Now().UTC().Add(10 * time.Minute).Format(time.RFC3339Nano)
				status, _ := a.post(s, "/api/v1/agent/heartbeat", hb)
				s.detail("  server accepted the heartbeat with %d and recorded the skew", status)
				return nil
			},
		},
		{
			name:    "browser",
			summary: "Contestant abandons the desktop shell and works in a browser.",
			expect:  "Allowed — the agent is alive. Live tab flips to BROWSER, and a submission records tel.web_client (15).",
			run: func(s *sim, a *fakeAgent) error {
				s.step("reporting with shell_alive=false, as the agent would")
				for i := 0; i < 3; i++ {
					if err := a.beatShell(s, false, nil); err != nil {
						return err
					}
				}
				s.detail("  the gate stays open: liveness is the agent's property, not the UI's")
				return nil
			},
		},
		{
			name:    "stopped",
			summary: "Contestant stops proctoring from the tray.",
			expect:  "Clean shutdown recorded. No gap and no crash finding; the Live tab says 'stopped deliberately' and submissions lock.",
			run: func(s *sim, a *fakeAgent) error {
				if err := a.beat(s, nil); err != nil {
					return err
				}
				s.step("clean shutdown")
				status, _ := a.post(s, "/api/v1/agent/shutdown", map[string]any{
					"reason":  "simulated: contestant stopped proctoring from the tray",
					"boot_id": a.bootID,
				})
				s.detail("  server recorded the stop with %d", status)
				return nil
			},
		},
		{
			name:    "crash",
			summary: "Agent is killed and restarts with a new boot id.",
			expect:  "tel.agent_crash (10) — low weight, because crashes happen — and every heartbeat after the restart is still accepted.",
			run: func(s *sim, a *fakeAgent) error {
				// Climb well past 1 first. A restart resets the agent's sequence, so
				// if the server kept the old boot's high-water mark the heartbeats
				// below would be refused as replays and the contestant would be
				// locked out until the counter caught up.
				for i := 0; i < 5; i++ {
					if err := a.beat(s, nil); err != nil {
						return err
					}
				}

				s.step("killed and relaunched: new boot id, sequence back to zero")
				a.bootID = randomUUID()
				a.seq = 0

				for i := 0; i < 3; i++ {
					if err := a.beat(s, nil); err != nil {
						return fmt.Errorf("heartbeat %d after restart was refused: %w", i+1, err)
					}
				}
				s.detail("  all post-restart heartbeats accepted: the sequence reset with the boot")
				return nil
			},
		},
		{
			name:    "server-restart",
			summary: "The contest server goes down and comes back while the agent keeps running.",
			expect:  "Held reports flush, the live heartbeat is accepted, and liveness resumes without a single 409.",
			run: func(s *sim, a *fakeAgent) error {
				for i := 0; i < 3; i++ {
					if err := a.beat(s, nil); err != nil {
						return err
					}
				}

				s.step("server unreachable — the agent keeps its sequence climbing and buffers")
				held := []heartbeat{}
				for i := 0; i < 3; i++ {
					hb := a.next(nil)
					hb.Buffered = true
					hb.WallTS = time.Now().UTC().Add(time.Duration(-(3 - i)) * 30 * time.Second).Format(time.RFC3339Nano)
					held = append(held, hb)
				}
				s.detail("  held seq %d–%d", held[0].Seq, held[len(held)-1].Seq)

				s.step("server back — live heartbeat first, then the flush")
				if err := a.beat(s, nil); err != nil {
					return fmt.Errorf("first heartbeat after the server returned was refused: %w", err)
				}
				if err := a.flush(s, held); err != nil {
					return err
				}
				return a.beat(s, nil)
			},
		},
	}
}

func withOllama(sig *signals) {
	sig.ProcessMatches = []string{"ollama", "ollama-runner"}
	sig.Ports = []portMatch{{
		Port: 11434, RuleID: "ai.port.ollama", Product: "Ollama", Confirmed: true,
	}}
	sig.ForegroundApp = "ai.ollama.app"
}

func main() {
	var (
		api       = flag.String("api", defaultAPI, "contest API base URL")
		name      = flag.String("scenario", "", "scenario to run, or 'all'")
		list      = flag.Bool("list", false, "list scenarios and what each proves")
		user      = flag.String("user", "", "competitor username")
		pass      = flag.String("pass", "", "competitor password")
		usersFile = flag.String("users", "", "CSV of competitors (username,display_name,password,...) for fleet scenarios")
		count     = flag.Int("count", 12, "how many agents to simulate in fleet-outage")
		adminUser = flag.String("admin", "", "admin username, to read the resulting findings back")
		adminPass = flag.String("admin-pass", "", "admin password")
		pace      = flag.Duration("pace", 400*time.Millisecond, "delay between simulated heartbeats")
	)
	flag.Parse()

	if *list || *name == "" {
		printScenarios()
		return
	}

	s := &sim{api: strings.TrimRight(*api, "/"), pace: *pace, http: &http.Client{Timeout: 10 * time.Second}}

	if *adminUser != "" {
		if err := s.loginAdmin(*adminUser, *adminPass); err != nil {
			fatal("admin login failed: %v", err)
		}
	}

	if *name == "fleet-outage" {
		users, err := loadUsers(*usersFile, *count)
		if err != nil {
			fatal("%v", err)
		}
		if err := s.fleetOutage(users); err != nil {
			fatal("%v", err)
		}
		return
	}

	selected := scenarios()
	if *name != "all" {
		selected = nil
		for _, sc := range scenarios() {
			if sc.name == *name {
				selected = []scenario{sc}
			}
		}
		if selected == nil {
			fatal("unknown scenario %q — run with -list to see the options", *name)
		}
	}

	if *user == "" || *pass == "" {
		fatal("-user and -pass are required for %q\n  example: make proctorsim ARGS='-scenario %s -user alice -pass secret'", *name, *name)
	}

	for _, sc := range selected {
		if err := s.runScenario(sc, *user, *pass); err != nil {
			fmt.Printf("  ✗ %s: %v\n\n", sc.name, err)
			continue
		}
	}
}

func printScenarios() {
	fmt.Print("proctorsim — drives the proctoring API as fake agents\n\n")

	for _, sc := range scenarios() {
		printEntry(sc.name, sc.summary, sc.expect)
	}
	printEntry(
		"fleet-outage",
		"Many agents stop reporting at once (needs -users).",
		"Opens a telemetry incident, suppresses every contestant gap, and keeps submissions flowing.",
	)

	fmt.Print("Run one:\n")
	fmt.Print("  make proctorsim ARGS='-scenario local-llm -user alice -pass secret'\n")
	fmt.Print("Run all of them, and have the resulting findings printed back:\n")
	fmt.Print("  make proctorsim ARGS='-scenario all -user alice -pass secret \\\n")
	fmt.Print("                        -admin admin -admin-pass s3cret'\n")
	fmt.Print("Simulate a fleet-wide outage:\n")
	fmt.Print("  make proctorsim ARGS='-scenario fleet-outage -users competitors.csv -count 20'\n")
}

func printEntry(name, summary, expect string) {
	fmt.Printf("  %-14s %s\n", name, strings.Join(wrap(summary, wrapWidth), "\n"+indent))
	for i, line := range wrap(expect, wrapWidth) {
		prefix := indent + "  "
		if i == 0 {
			prefix = indent + "→ "
		}
		fmt.Printf("%s%s\n", prefix, line)
	}
	fmt.Println()
}

const (
	// Narrow enough to survive a docker compose exec in a split terminal, which is
	// where this is actually read.
	wrapWidth = 62
	indent    = "                 "
)

func wrap(text string, width int) []string {
	words := strings.Fields(text)
	if len(words) == 0 {
		return []string{""}
	}

	lines := []string{}
	current := words[0]
	for _, word := range words[1:] {
		if len(current)+1+len(word) > width {
			lines = append(lines, current)
			current = word
			continue
		}
		current += " " + word
	}
	return append(lines, current)
}

func loadUsers(path string, count int) ([]credential, error) {
	if path == "" {
		return nil, fmt.Errorf("fleet-outage needs -users pointing at the CSV you seeded with cmd/usertool")
	}
	file, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("open %s: %w", path, err)
	}
	defer file.Close()

	reader := csv.NewReader(file)
	reader.FieldsPerRecord = -1

	var creds []credential
	for {
		row, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("read %s: %w", path, err)
		}
		if len(row) < 3 {
			continue
		}
		username, password := strings.TrimSpace(row[0]), strings.TrimSpace(row[2])
		if username == "" || password == "" || strings.EqualFold(username, "username") {
			continue
		}
		creds = append(creds, credential{username, password})
		if len(creds) >= count {
			break
		}
	}
	if len(creds) == 0 {
		return nil, fmt.Errorf("no usable rows in %s (want username,display_name,password)", path)
	}
	return creds, nil
}

type credential struct {
	user string
	pass string
}

func fatal(format string, args ...any) {
	fmt.Fprintf(os.Stderr, format+"\n", args...)
	os.Exit(1)
}

func randomHex(n int) string {
	buf := make([]byte, n)
	_, _ = rand.Read(buf)
	return hex.EncodeToString(buf)
}

func randomUUID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}

func jsonBody(v any) io.Reader {
	buf, _ := json.Marshal(v)
	return bytes.NewReader(buf)
}

func sortedKeys[V any](m map[string]V) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}
