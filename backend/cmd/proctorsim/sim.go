package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

type sim struct {
	api        string
	pace       time.Duration
	http       *http.Client
	adminToken string
}

func (s *sim) step(format string, args ...any) {
	fmt.Printf("  → %s\n", fmt.Sprintf(format, args...))
}

func (s *sim) detail(format string, args ...any) {
	fmt.Printf("%s\n", fmt.Sprintf(format, args...))
}

func (s *sim) request(method, path, token string, payload any) (int, string) {
	var body = jsonBody(payload)
	if payload == nil {
		body = nil
	}

	req, err := http.NewRequest(method, s.api+path, body)
	if err != nil {
		return 0, err.Error()
	}
	if payload != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	resp, err := s.http.Do(req)
	if err != nil {
		return 0, err.Error()
	}
	return resp.StatusCode, readBody(resp)
}

func (s *sim) loginAdmin(username, password string) error {
	status, body := s.request(http.MethodPost, "/api/v1/auth/login", "", map[string]any{
		"username": username,
		"password": password,
	})
	if status != http.StatusOK {
		return fmt.Errorf("%d: %s", status, strings.TrimSpace(body))
	}
	var parsed struct {
		SessionToken string `json:"sessionToken"`
	}
	if err := json.Unmarshal([]byte(body), &parsed); err != nil {
		return err
	}
	s.adminToken = parsed.SessionToken
	return nil
}

func (s *sim) runScenario(sc scenario, user, pass string) error {
	fmt.Printf("\n▸ %s — %s\n", sc.name, sc.summary)
	fmt.Printf("  expected: %s\n", sc.expect)

	agent := newFakeAgent(user, pass)
	if err := agent.enroll(s); err != nil {
		return err
	}

	if err := sc.run(s, agent); err != nil {
		return err
	}

	s.reportFindings(agent.user)
	return nil
}

// reportFindings reads the evidence back through the admin API so a scenario proves
// itself, rather than leaving you to hunt for it in the UI.
func (s *sim) reportFindings(username string) {
	if s.adminToken == "" {
		fmt.Println("  (pass -admin/-admin-pass to have the resulting findings printed here)")
		return
	}

	userID, err := s.findUserID(username)
	if err != nil {
		fmt.Printf("  could not resolve %s: %v\n", username, err)
		return
	}

	status, body := s.request(http.MethodGet, "/api/v1/admin/proctor/timeline/"+userID, s.adminToken, nil)
	if status != http.StatusOK {
		fmt.Printf("  timeline read returned %d\n", status)
		return
	}

	var timeline struct {
		Score    int    `json:"score"`
		Severity string `json:"severity"`
		Entries  []struct {
			Kind   string `json:"kind"`
			At     string `json:"at"`
			Label  string `json:"label"`
			Detail string `json:"detail"`
			Weight int    `json:"weight"`
			Count  int    `json:"count"`
		} `json:"entries"`
	}
	if err := json.Unmarshal([]byte(body), &timeline); err != nil {
		fmt.Printf("  could not parse the timeline: %v\n", err)
		return
	}

	fmt.Printf("  result: risk %d %s\n", timeline.Score, timeline.Severity)
	shown := 0
	for _, e := range timeline.Entries {
		if e.Kind != "finding" && e.Kind != "gap" {
			continue
		}
		clock := e.At
		if len(clock) >= 19 {
			clock = clock[11:19]
		}
		if e.Kind == "gap" {
			fmt.Printf("    %s  blackout   %s (%ds)\n", clock, e.Label, e.Count)
		} else {
			fmt.Printf("    %s  finding    %s (%s, weight %d, seen %d×)\n",
				clock, e.Detail, e.Label, e.Weight, e.Count)
		}
		shown++
		if shown >= 10 {
			break
		}
	}
	if shown == 0 {
		fmt.Println("    no findings — clean")
	}
}

func (s *sim) findUserID(username string) (string, error) {
	status, body := s.request(http.MethodGet, "/api/v1/admin/proctor/risk", s.adminToken, nil)
	if status != http.StatusOK {
		return "", fmt.Errorf("risk list returned %d", status)
	}
	var parsed struct {
		Risk []struct {
			UserID   string `json:"userId"`
			Username string `json:"username"`
		} `json:"risk"`
	}
	if err := json.Unmarshal([]byte(body), &parsed); err != nil {
		return "", err
	}
	for _, r := range parsed.Risk {
		if strings.EqualFold(r.Username, username) {
			return r.UserID, nil
		}
	}
	return "", fmt.Errorf("not found in the competitor list")
}

// fleetOutage is the scenario that proves the system can tell "they disconnected"
// from "we broke". Every agent goes quiet at once, which must open an incident and
// suppress contestant gaps rather than manufacture hundreds of findings.
func (s *sim) fleetOutage(users []credential) error {
	fmt.Printf("\n▸ fleet-outage — %d agents report, then all stop at once\n", len(users))
	fmt.Println("  expected: a telemetry incident opens, contestant gaps are suppressed, submissions keep flowing.")

	agents := make([]*fakeAgent, 0, len(users))
	for _, cred := range users {
		agent := newFakeAgent(cred.user, cred.pass)
		if err := agent.enroll(s); err != nil {
			fmt.Printf("  skipping %s: %v\n", cred.user, err)
			continue
		}
		agents = append(agents, agent)
	}
	if len(agents) == 0 {
		return fmt.Errorf("no agents enrolled")
	}

	s.step("all %d agents reporting normally", len(agents))
	for _, agent := range agents {
		if err := agent.beat(s, nil); err != nil {
			fmt.Printf("  %s: %v\n", agent.user, err)
		}
	}

	stale := 95 * time.Second
	s.step("every agent goes silent — waiting %s for the sweeper to notice", stale)
	fmt.Println("  (the sweeper runs every 30s; watch the admin monitoring header)")
	time.Sleep(stale)

	if s.adminToken == "" {
		fmt.Println("  pass -admin/-admin-pass to have the incident state printed here")
		return nil
	}

	status, body := s.request(http.MethodGet, "/api/v1/admin/proctor/overview", s.adminToken, nil)
	if status != http.StatusOK {
		return fmt.Errorf("overview returned %d", status)
	}

	var overview struct {
		Fleet struct {
			Enrolled int `json:"enrolled"`
			Online   int `json:"online"`
			Offline  int `json:"offline"`
			InGap    int `json:"inGap"`
		} `json:"fleet"`
		Incident *struct {
			AffectedAgents int `json:"affectedAgents"`
			EnrolledAgents int `json:"enrolledAgents"`
		} `json:"incident"`
	}
	if err := json.Unmarshal([]byte(body), &overview); err != nil {
		return err
	}

	fmt.Printf("  fleet: %d enrolled · %d online · %d offline · %d in blackout\n",
		overview.Fleet.Enrolled, overview.Fleet.Online, overview.Fleet.Offline, overview.Fleet.InGap)

	if overview.Incident != nil {
		fmt.Printf("  ✓ incident open: %d of %d agents affected — contestant gaps suppressed\n",
			overview.Incident.AffectedAgents, overview.Incident.EnrolledAgents)
		if overview.Fleet.InGap > 0 {
			fmt.Printf("  ! %d contestants still show a blackout; expected 0 during an incident\n", overview.Fleet.InGap)
		}
	} else {
		fmt.Println("  ! no incident opened — under 30% of the live fleet went quiet, so gaps are attributed individually")
	}
	return nil
}
