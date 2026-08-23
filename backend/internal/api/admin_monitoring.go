package api

import (
	"net/http"
	"strconv"
	"strings"
	"sync"

	"github.com/gin-gonic/gin"

	"github.com/NayanthaNethsara/mini-algothon/backend/internal/agent"
	"github.com/NayanthaNethsara/mini-algothon/backend/internal/telemetry"
)

// monitoringSections are the panels the admin console can ask for.
var monitoringSections = []string{"overview", "telemetry", "risk", "agents"}

// monitoringSnapshot is everything the console needs for one refresh.
//
// The slices are pointers because "not asked for" and "asked for and empty" are
// different answers: the console keeps whatever it already has for an absent
// section, and must clear the table for an empty one. A plain nil slice with
// omitempty would collapse the two and leave stale contestants on screen.
type monitoringSnapshot struct {
	Overview     *agent.Overview        `json:"overview,omitempty"`
	Telemetry    *[]telemetry.Heartbeat `json:"telemetry,omitempty"`
	Risk         *[]competitorRiskItem  `json:"risk,omitempty"`
	Agents       *[]agentItem           `json:"agents,omitempty"`
	IncidentOpen *bool                  `json:"incidentOpen,omitempty"`
	// Sections that failed, by name. One dead panel must not blank a console
	// somebody is running a contest from.
	Errors map[string]string `json:"errors"`
}

// @Summary Monitoring Snapshot
// @Description Every panel the proctoring console shows, in one call: fleet overview, agent heartbeats, risk rollups and enrollments. Sections run concurrently and are selected with `include`.
// @Tags Admin Proctoring
// @Produce json
// @Security BearerAuth
// @Param include query string false "Comma-separated subset of overview,telemetry,risk,agents (default all)"
// @Param status query string false "Telemetry filter: ONLINE, STALE, OFFLINE or GAP"
// @Param q query string false "Telemetry filter: match username or display name"
// @Param limit query int false "Telemetry page size (default 100, max 500)"
// @Param offset query int false "Telemetry page offset"
// @Success 200 {object} monitoringSnapshot
// @Failure 401 {object} map[string]string
// @Failure 500 {object} monitoringSnapshot
// @Router /api/v1/admin/monitoring [get]
//
// The console polls this every few seconds. Serving it from four separate
// endpoints meant the browser paid a round trip per panel, and over a hosted
// front end those round trips crossed a region each. Here the four queries run
// against the same pool in the same datacenter as Postgres, so the caller pays
// one round trip and waits only for the slowest query rather than their sum.
func (h *handler) getAdminMonitoring(c *gin.Context) {
	sections := parseMonitoringSections(c.Query("include"))
	ctx := c.Request.Context()

	snapshot := monitoringSnapshot{Errors: map[string]string{}}

	var mu sync.Mutex
	var wg sync.WaitGroup

	run := func(section string, fn func() error) {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if err := fn(); err != nil {
				if h.log != nil {
					h.log.Warn("monitoring section failed", "section", section, "error", err)
				}
				mu.Lock()
				snapshot.Errors[section] = err.Error()
				mu.Unlock()
			}
		}()
	}

	for _, section := range sections {
		switch section {
		case "overview":
			run(section, func() error {
				overview, err := h.agents.Overview(ctx)
				if err != nil {
					return err
				}
				mu.Lock()
				snapshot.Overview = &overview
				mu.Unlock()
				return nil
			})

		case "telemetry":
			limit, _ := strconv.Atoi(c.Query("limit"))
			offset, _ := strconv.Atoi(c.Query("offset"))
			filter := telemetry.ListFilter{
				Status: c.Query("status"),
				Query:  c.Query("q"),
				Limit:  limit,
				Offset: offset,
			}
			run(section, func() error {
				heartbeats, _, err := h.telemetry.ListHeartbeats(ctx, filter)
				if err != nil {
					return err
				}
				if heartbeats == nil {
					heartbeats = []telemetry.Heartbeat{}
				}
				mu.Lock()
				snapshot.Telemetry = &heartbeats
				mu.Unlock()
				return nil
			})

		case "risk":
			run(section, func() error {
				risk, err := h.listProctorRisk(ctx)
				if err != nil {
					return err
				}
				mu.Lock()
				snapshot.Risk = &risk
				mu.Unlock()
				return nil
			})

		case "agents":
			run(section, func() error {
				agents, err := h.listAgents(ctx)
				if err != nil {
					return err
				}
				// Same as the standalone endpoint: the flag only suppresses gap
				// alarms, so losing it is not worth failing the panel over.
				incidentOpen, incidentErr := h.agents.IncidentOpen(ctx)
				if incidentErr != nil {
					incidentOpen = false
				}
				mu.Lock()
				snapshot.Agents = &agents
				snapshot.IncidentOpen = &incidentOpen
				mu.Unlock()
				return nil
			})
		}
	}

	wg.Wait()

	// Partial results still render; nothing at all is a real failure and the
	// console should say so rather than show an empty contest.
	if len(snapshot.Errors) == len(sections) {
		c.JSON(http.StatusInternalServerError, snapshot)
		return
	}

	c.JSON(http.StatusOK, snapshot)
}

// parseMonitoringSections drops names it does not recognise; asking for nothing
// recognisable returns everything, which is what a caller with no opinion wants.
func parseMonitoringSections(include string) []string {
	if include == "" {
		return monitoringSections
	}

	asked := map[string]bool{}
	for _, part := range strings.Split(include, ",") {
		asked[strings.TrimSpace(part)] = true
	}

	picked := make([]string, 0, len(monitoringSections))
	for _, section := range monitoringSections {
		if asked[section] {
			picked = append(picked, section)
		}
	}
	if len(picked) == 0 {
		return monitoringSections
	}
	return picked
}
