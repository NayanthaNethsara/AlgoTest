package scenarios

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type CleanupConfig struct {
	BaseURL        string
	AdminToken     string
	CacheDirectory string
}

type CleanupReport struct {
	DeletedUsers int      `json:"deletedUsers"`
	DeletedTeams int      `json:"deletedTeams"`
	PurgedFiles  []string `json:"purgedFiles"`
	Errors       []string `json:"errors,omitempty"`
}

func RunCleanup(ctx context.Context, config CleanupConfig) (*CleanupReport, error) {
	client := &http.Client{Timeout: 30 * time.Second}
	cleanBaseURL := strings.TrimRight(config.BaseURL, "/")

	if config.AdminToken == "" {
		return nil, fmt.Errorf("admin credentials required to perform cleanup of test accounts")
	}

	report := &CleanupReport{}

	// 1. Clean up test users matching prefix "stresstest_"
	usersReq, err := http.NewRequestWithContext(ctx, http.MethodGet, cleanBaseURL+"/api/v1/admin/users", nil)
	if err != nil {
		return nil, err
	}
	usersReq.Header.Set("Cookie", "session="+config.AdminToken)

	usersResp, err := client.Do(usersReq)
	if err != nil {
		return nil, fmt.Errorf("list users failed: %w", err)
	}
	defer usersResp.Body.Close()

	if usersResp.StatusCode == http.StatusOK {
		var usersData struct {
			Users []struct {
				ID       string `json:"id"`
				Username string `json:"username"`
			} `json:"users"`
		}
		if json.NewDecoder(usersResp.Body).Decode(&usersData) == nil {
			for _, u := range usersData.Users {
				if strings.HasPrefix(strings.ToLower(u.Username), "stresstest_") {
					delReq, _ := http.NewRequestWithContext(ctx, http.MethodDelete, cleanBaseURL+"/api/v1/admin/users/"+u.ID, nil)
					delReq.Header.Set("Cookie", "session="+config.AdminToken)

					delResp, delErr := client.Do(delReq)
					if delErr == nil && (delResp.StatusCode == http.StatusOK || delResp.StatusCode == http.StatusNoContent) {
						report.DeletedUsers++
					} else if delErr != nil {
						report.Errors = append(report.Errors, fmt.Sprintf("delete user %s: %v", u.Username, delErr))
					}
					if delResp != nil {
						delResp.Body.Close()
					}
				}
			}
		}
	}

	// 2. Clean up test teams matching prefix "StressTeam_"
	teamsReq, err := http.NewRequestWithContext(ctx, http.MethodGet, cleanBaseURL+"/api/v1/admin/teams", nil)
	if err == nil {
		teamsReq.Header.Set("Cookie", "session="+config.AdminToken)
		teamsResp, teamsErr := client.Do(teamsReq)
		if teamsErr == nil {
			defer teamsResp.Body.Close()
			if teamsResp.StatusCode == http.StatusOK {
				var teamsData struct {
					Teams []struct {
						ID   string `json:"id"`
						Name string `json:"name"`
					} `json:"teams"`
				}
				if json.NewDecoder(teamsResp.Body).Decode(&teamsData) == nil {
					for _, t := range teamsData.Teams {
						if strings.HasPrefix(t.Name, "StressTeam_") {
							delReq, _ := http.NewRequestWithContext(ctx, http.MethodDelete, cleanBaseURL+"/api/v1/admin/teams/"+t.ID, nil)
							delReq.Header.Set("Cookie", "session="+config.AdminToken)

							delResp, delErr := client.Do(delReq)
							if delErr == nil && (delResp.StatusCode == http.StatusOK || delResp.StatusCode == http.StatusNoContent) {
								report.DeletedTeams++
							} else if delErr != nil {
								report.Errors = append(report.Errors, fmt.Sprintf("delete team %s: %v", t.Name, delErr))
							}
							if delResp != nil {
								delResp.Body.Close()
							}
						}
					}
				}
			}
		}
	}

	// 3. Purge session cache files
	if config.CacheDirectory != "" {
		entries, _ := os.ReadDir(config.CacheDirectory)
		for _, e := range entries {
			if strings.HasPrefix(e.Name(), "sessions_") && strings.HasSuffix(e.Name(), ".json") {
				filePath := filepath.Join(config.CacheDirectory, e.Name())
				if os.Remove(filePath) == nil {
					report.PurgedFiles = append(report.PurgedFiles, e.Name())
				}
			}
		}
	}

	return report, nil
}
