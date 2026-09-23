package scenarios

import (
	"bytes"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

type SessionManager struct {
	client  *http.Client
	baseURL string
}

func NewSessionManager(client *http.Client, baseURL string) *SessionManager {
	return &SessionManager{
		client:  client,
		baseURL: strings.TrimRight(baseURL, "/"),
	}
}

func (manager *SessionManager) AuthenticateUsersWithPacing(credentials []UserCredential) ([]UserSession, error) {
	var (
		sessions   []UserSession
		sessionsMu sync.Mutex
		waitGroup  sync.WaitGroup
	)

	// Concurrency cap of 6 workers with 50ms pacing between requests
	// ensures single-device testing does not trigger Nginx 20 req/s auth limit
	// or exhaust Go backend bcrypt semaphore (max 8 concurrent checks).
	const maxLoginWorkers = 6
	workerTokens := make(chan struct{}, maxLoginWorkers)

	for _, credential := range credentials {
		waitGroup.Add(1)
		go func(cred UserCredential) {
			defer waitGroup.Done()
			workerTokens <- struct{}{}
			defer func() { <-workerTokens }()

			time.Sleep(50 * time.Millisecond)

			sessionToken, userID, err := manager.loginSingleUser(cred.Username, cred.Password)
			if err == nil && sessionToken != "" {
				sessionsMu.Lock()
				sessions = append(sessions, UserSession{
					Username: cred.Username,
					Token:    sessionToken,
					UserID:   userID,
				})
				sessionsMu.Unlock()
			}
		}(credential)
	}

	waitGroup.Wait()

	if len(sessions) == 0 {
		return nil, fmt.Errorf("all %d authentication attempts failed", len(credentials))
	}

	return sessions, nil
}

func (manager *SessionManager) loginSingleUser(username, password string) (string, string, error) {
	loginPayload, _ := json.Marshal(map[string]string{
		"username": username,
		"password": password,
	})

	for attempt := 0; attempt < 3; attempt++ {
		request, err := http.NewRequest(http.MethodPost, manager.baseURL+"/api/v1/auth/login", bytes.NewReader(loginPayload))
		if err != nil {
			return "", "", err
		}
		request.Header.Set("Content-Type", "application/json")

		response, requestErr := manager.client.Do(request)
		if requestErr != nil {
			time.Sleep(200 * time.Millisecond)
			continue
		}

		if response.StatusCode == http.StatusOK {
			var loginData struct {
				SessionToken string `json:"sessionToken"`
				User         struct {
					ID string `json:"id"`
				} `json:"user"`
			}
			decodeErr := json.NewDecoder(response.Body).Decode(&loginData)
			response.Body.Close()

			if decodeErr == nil && loginData.SessionToken != "" {
				return loginData.SessionToken, loginData.User.ID, nil
			}
		} else {
			response.Body.Close()
		}

		time.Sleep(300 * time.Millisecond)
	}

	return "", "", fmt.Errorf("login failed for user %s", username)
}

func (manager *SessionManager) AdminLogin(adminUsername, adminPassword string) (string, error) {
	token, _, err := manager.loginSingleUser(adminUsername, adminPassword)
	if err != nil {
		return "", fmt.Errorf("admin authentication failed: %w", err)
	}
	return token, nil
}

func (manager *SessionManager) AutoProvisionUsers(adminToken string, userCount int) ([]UserCredential, error) {
	type bulkCreateRequest struct {
		Username    string `json:"username"`
		DisplayName string `json:"displayName"`
		Password    string `json:"password"`
		TeamID      string `json:"teamId"`
	}

	type bulkCreateResult struct {
		Username string `json:"username"`
		Status   string `json:"status"`
		Error    string `json:"error,omitempty"`
		User     struct {
			ID string `json:"id"`
		} `json:"user"`
	}

	var createdCredentials []UserCredential
	timestampBatchSuffix := time.Now().Unix() % 100000
	const usersPerTeam = 1
	teamCount := (userCount + usersPerTeam - 1) / usersPerTeam

	for teamIndex := 1; teamIndex <= teamCount; teamIndex++ {
		teamName := fmt.Sprintf("StressTeam_%d_%02d", timestampBatchSuffix, teamIndex)
		teamBody, _ := json.Marshal(map[string]string{"name": teamName})
		teamRequest, _ := http.NewRequest(http.MethodPost, manager.baseURL+"/api/v1/admin/teams", bytes.NewReader(teamBody))
		teamRequest.Header.Set("Content-Type", "application/json")
		teamRequest.Header.Set("Cookie", "session="+adminToken)

		teamResponse, err := manager.client.Do(teamRequest)
		if err != nil {
			return nil, fmt.Errorf("create team %s failed: %w", teamName, err)
		}

		var teamOutput struct {
			Team struct {
				ID string `json:"id"`
			} `json:"team"`
		}
		_ = json.NewDecoder(teamResponse.Body).Decode(&teamOutput)
		teamResponse.Body.Close()
		teamID := teamOutput.Team.ID

		startIndex := (teamIndex-1)*usersPerTeam + 1
		endIndex := teamIndex * usersPerTeam
		if endIndex > userCount {
			endIndex = userCount
		}

		var batchUsers []bulkCreateRequest
		var batchCreds []UserCredential

		for userNumber := startIndex; userNumber <= endIndex; userNumber++ {
			u := fmt.Sprintf("stresstest_%d_%03d", timestampBatchSuffix, userNumber)
			p := "StressPass_123!"
			batchUsers = append(batchUsers, bulkCreateRequest{
				Username:    u,
				DisplayName: fmt.Sprintf("Stress User %d", userNumber),
				Password:    p,
				TeamID:      teamID,
			})
			batchCreds = append(batchCreds, UserCredential{Username: u, Password: p})
		}

		bulkBody, _ := json.Marshal(map[string]any{
			"teamId": teamID,
			"users":  batchUsers,
		})

		bulkRequest, _ := http.NewRequest(http.MethodPost, manager.baseURL+"/api/v1/admin/users/bulk", bytes.NewReader(bulkBody))
		bulkRequest.Header.Set("Content-Type", "application/json")
		bulkRequest.Header.Set("Cookie", "session="+adminToken)

		bulkResponse, bulkErr := manager.client.Do(bulkRequest)
		if bulkErr != nil {
			return nil, fmt.Errorf("bulk create failed for team %s: %w", teamName, bulkErr)
		}

		var bulkOutput struct {
			Results []bulkCreateResult `json:"results"`
		}
		_ = json.NewDecoder(bulkResponse.Body).Decode(&bulkOutput)
		bulkResponse.Body.Close()

		for _, result := range bulkOutput.Results {
			if result.Status == "created" && result.User.ID != "" {
				accessBody, _ := json.Marshal(map[string]any{
					"webOnly":    true,
					"reason":     "automated load test bypass",
					"hoursValid": 4,
				})
				accessReq, _ := http.NewRequest(http.MethodPatch, manager.baseURL+"/api/v1/admin/users/"+result.User.ID+"/access", bytes.NewReader(accessBody))
				accessReq.Header.Set("Content-Type", "application/json")
				accessReq.Header.Set("Cookie", "session="+adminToken)
				if accResp, accErr := manager.client.Do(accessReq); accErr == nil {
					accResp.Body.Close()
				}
			}
		}

		createdCredentials = append(createdCredentials, batchCreds...)
	}

	return createdCredentials, nil
}

func (manager *SessionManager) LoadCredentialsFromCSV(filePath string) ([]UserCredential, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	csvReader := csv.NewReader(file)
	rows, readErr := csvReader.ReadAll()
	if readErr != nil {
		return nil, readErr
	}

	var credentials []UserCredential
	for _, row := range rows {
		if len(row) < 2 {
			continue
		}
		u := strings.TrimSpace(row[0])
		p := strings.TrimSpace(row[1])
		if u == "" || strings.EqualFold(u, "username") {
			continue
		}
		credentials = append(credentials, UserCredential{Username: u, Password: p})
	}
	return credentials, nil
}

func (manager *SessionManager) SaveSessionsToCache(cacheDirectory string, sessions []UserSession) error {
	if err := os.MkdirAll(cacheDirectory, 0755); err != nil {
		return err
	}

	parsedURL, _ := url.Parse(manager.baseURL)
	hostFilename := strings.ReplaceAll(parsedURL.Host, ":", "_")
	targetFilePath := filepath.Join(cacheDirectory, fmt.Sprintf("sessions_%s.json", hostFilename))

	encodedData, err := json.MarshalIndent(sessions, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(targetFilePath, encodedData, 0600)
}

func (manager *SessionManager) TryLoadCachedSessions(cacheDirectory string, requiredCount int) ([]UserSession, bool) {
	parsedURL, _ := url.Parse(manager.baseURL)
	hostFilename := strings.ReplaceAll(parsedURL.Host, ":", "_")
	targetFilePath := filepath.Join(cacheDirectory, fmt.Sprintf("sessions_%s.json", hostFilename))

	fileData, err := os.ReadFile(targetFilePath)
	if err != nil {
		return nil, false
	}

	var loadedSessions []UserSession
	if err := json.Unmarshal(fileData, &loadedSessions); err != nil || len(loadedSessions) < requiredCount {
		return nil, false
	}

	// Validate the first session against /api/v1/me to verify token validity
	testRequest, _ := http.NewRequest(http.MethodGet, manager.baseURL+"/api/v1/me", nil)
	testRequest.Header.Set("Cookie", "session="+loadedSessions[0].Token)

	testResponse, testErr := manager.client.Do(testRequest)
	if testErr != nil || testResponse.StatusCode != http.StatusOK {
		if testResponse != nil {
			testResponse.Body.Close()
		}
		return nil, false
	}
	io.Copy(io.Discard, testResponse.Body)
	testResponse.Body.Close()

	return loadedSessions[:requiredCount], true
}
