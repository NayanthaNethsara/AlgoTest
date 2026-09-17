package dashboard

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

type Server struct {
	port       int
	reportsDir string
	baseURL    string
	isBusy     bool
	busyMu     sync.Mutex
}

func NewServer(port int, reportsDir, baseURL string) *Server {
	return &Server{
		port:       port,
		reportsDir: reportsDir,
		baseURL:    baseURL,
	}
}

func (s *Server) Start() error {
	mux := http.NewServeMux()
	mux.HandleFunc("/", s.handleIndex)
	mux.HandleFunc("/api/reports", s.handleListReports)
	mux.HandleFunc("/api/reports/", s.handleGetReport)
	mux.HandleFunc("/api/run", s.handleRunTest)

	addr := fmt.Sprintf(":%d", s.port)
	fmt.Printf("\n=========================================================\n")
	fmt.Printf("  MiniAlgothon Load Test Dashboard running at:\n")
	fmt.Printf("  http://localhost:%d\n", s.port)
	fmt.Printf("=========================================================\n\n")

	// Attempt to open the dashboard automatically in default browser
	_ = exec.Command("open", fmt.Sprintf("http://localhost:%d", s.port)).Start()

	return http.ListenAndServe(addr, mux)
}

func (s *Server) handleIndex(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Write([]byte(indexHTML))
}

func (s *Server) handleListReports(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	files, err := os.ReadDir(s.reportsDir)
	if err != nil {
		json.NewEncoder(w).Encode([]any{})
		return
	}

	type reportSummary struct {
		ID        string `json:"id"`
		Title     string `json:"title"`
		Scenario  string `json:"scenario"`
		Profile   string `json:"profile"`
		Timestamp string `json:"timestamp"`
		File      string `json:"file"`
	}

	var reports []reportSummary
	for _, f := range files {
		if strings.HasSuffix(f.Name(), ".json") && strings.HasPrefix(f.Name(), "report_") {
			filePath := filepath.Join(s.reportsDir, f.Name())
			data, readErr := os.ReadFile(filePath)
			if readErr == nil {
				var parsed struct {
					Title        string `json:"title"`
					ScenarioName string `json:"scenarioName"`
					ProfileName  string `json:"profileName"`
					Timestamp    string `json:"timestamp"`
				}
				if json.Unmarshal(data, &parsed) == nil {
					reports = append(reports, reportSummary{
						ID:        strings.TrimSuffix(f.Name(), ".json"),
						Title:     parsed.Title,
						Scenario:  parsed.ScenarioName,
						Profile:   parsed.ProfileName,
						Timestamp: parsed.Timestamp,
						File:      f.Name(),
					})
				}
			}
		}
	}

	sort.Slice(reports, func(i, j int) bool {
		return reports[i].Timestamp > reports[j].Timestamp
	})

	json.NewEncoder(w).Encode(reports)
}

func (s *Server) handleGetReport(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	id := strings.TrimPrefix(r.URL.Path, "/api/reports/")
	id = filepath.Base(id)

	filePath := filepath.Join(s.reportsDir, id+".json")
	data, err := os.ReadFile(filePath)
	if err != nil {
		http.Error(w, `{"error":"report not found"}`, http.StatusNotFound)
		return
	}
	w.Write(data)
}

type RunRequestPayload struct {
	Scenario    string `json:"scenario"`
	Profile     string `json:"profile"`
	Concurrency int    `json:"concurrency"`
	Duration    string `json:"duration"`
	AdminUser   string `json:"adminUser"`
	AdminPass   string `json:"adminPass"`
	Lang        string `json:"lang"`
}

func (s *Server) handleRunTest(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"POST required"}`, http.StatusMethodNotAllowed)
		return
	}

	s.busyMu.Lock()
	if s.isBusy {
		s.busyMu.Unlock()
		http.Error(w, `{"error":"another test is currently running"}`, http.StatusConflict)
		return
	}
	s.isBusy = true
	s.busyMu.Unlock()

	defer func() {
		s.busyMu.Lock()
		s.isBusy = false
		s.busyMu.Unlock()
	}()

	var payload RunRequestPayload
	_ = json.NewDecoder(r.Body).Decode(&payload)

	args := []string{
		"run", ".",
		"-url", s.baseURL,
		"-scenario", payload.Scenario,
		"-profile", payload.Profile,
	}

	if payload.Concurrency > 0 {
		args = append(args, "-concurrency", fmt.Sprintf("%d", payload.Concurrency))
	}
	if payload.Duration != "" {
		args = append(args, "-duration", payload.Duration)
	}
	if payload.AdminUser != "" {
		args = append(args, "-admin", payload.AdminUser)
	}
	if payload.AdminPass != "" {
		args = append(args, "-admin-pass", payload.AdminPass)
	}
	if payload.Lang != "" {
		args = append(args, "-lang", payload.Lang)
	}

	cmd := exec.Command("go", args...)
	cmd.Dir = filepath.Dir(s.reportsDir)
	output, err := cmd.CombinedOutput()

	w.Header().Set("Content-Type", "application/json")
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]any{
			"error":  err.Error(),
			"output": string(output),
		})
		return
	}

	// Find newly generated report
	time.Sleep(300 * time.Millisecond)
	files, _ := os.ReadDir(s.reportsDir)
	var latestFile string
	var latestMod time.Time
	for _, f := range files {
		if strings.HasSuffix(f.Name(), ".json") {
			info, _ := f.Info()
			if info != nil && info.ModTime().After(latestMod) {
				latestMod = info.ModTime()
				latestFile = f.Name()
			}
		}
	}

	var reportData any
	if latestFile != "" {
		b, _ := os.ReadFile(filepath.Join(s.reportsDir, latestFile))
		_ = json.Unmarshal(b, &reportData)
	}

	json.NewEncoder(w).Encode(map[string]any{
		"status": "success",
		"output": string(output),
		"report": reportData,
	})
}

const indexHTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MiniAlgothon Load Testing Dashboard</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
  <style>
    :root {
      --bg: #090d16;
      --sidebar: #0f1523;
      --card-bg: #111726;
      --card-border: #1f293d;
      --text: #f1f5f9;
      --text-muted: #94a3b8;
      --primary: #6366f1;
      --primary-hover: #4f46e5;
      --success: #10b981;
      --warning: #f59e0b;
      --danger: #ef4444;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg);
      color: var(--text);
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      min-height: 100vh;
      display: flex;
    }
    .sidebar {
      width: 320px;
      background: var(--sidebar);
      border-right: 1px solid var(--card-border);
      padding: 1.5rem;
      display: flex;
      flex-direction: column;
      height: 100vh;
      position: sticky;
      top: 0;
    }
    .main-content {
      flex: 1;
      padding: 2rem;
      overflow-y: auto;
    }
    .logo {
      font-size: 1.15rem;
      font-weight: 700;
      color: #fff;
      margin-bottom: 1.5rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .section-title {
      font-size: 0.75rem;
      text-transform: uppercase;
      font-weight: 600;
      color: var(--text-muted);
      letter-spacing: 0.05em;
      margin-bottom: 0.75rem;
    }
    .control-group {
      margin-bottom: 1rem;
    }
    label {
      display: block;
      font-size: 0.75rem;
      color: var(--text-muted);
      margin-bottom: 0.35rem;
    }
    select, input {
      width: 100%;
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      color: #fff;
      padding: 0.6rem 0.75rem;
      border-radius: 0.5rem;
      font-size: 0.875rem;
      font-family: inherit;
    }
    select:focus, input:focus {
      outline: none;
      border-color: var(--primary);
    }
    .btn {
      width: 100%;
      background: var(--primary);
      color: #fff;
      border: none;
      padding: 0.75rem 1rem;
      border-radius: 0.5rem;
      font-weight: 600;
      font-size: 0.875rem;
      cursor: pointer;
      transition: background 0.2s;
    }
    .btn:hover { background: var(--primary-hover); }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    
    .reports-list {
      flex: 1;
      overflow-y: auto;
      margin-top: 1rem;
    }
    .report-item {
      padding: 0.75rem;
      border: 1px solid var(--card-border);
      border-radius: 0.5rem;
      margin-bottom: 0.5rem;
      cursor: pointer;
      transition: all 0.2s;
      background: var(--card-bg);
    }
    .report-item:hover, .report-item.active {
      border-color: var(--primary);
      background: rgba(99, 102, 241, 0.1);
    }
    .report-title { font-weight: 600; font-size: 0.85rem; }
    .report-meta { font-size: 0.7rem; color: var(--text-muted); margin-top: 0.25rem; }
    
    .top-banner {
      background: linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(16, 185, 129, 0.1));
      border: 1px solid rgba(99, 102, 241, 0.3);
      border-radius: 0.75rem;
      padding: 1rem 1.5rem;
      margin-bottom: 2rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }
    .stat-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 0.75rem;
      padding: 1.25rem;
    }
    .stat-label { font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); font-weight: 600; }
    .stat-value { font-size: 1.75rem; font-weight: 700; color: #fff; margin-top: 0.25rem; font-family: 'JetBrains Mono', monospace; }
    .stat-sub { font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem; }
    
    .charts-grid {
      display: grid;
      grid-template-columns: 2fr 1fr;
      gap: 1.5rem;
      margin-bottom: 2rem;
    }
    @media (max-width: 900px) {
      .charts-grid { grid-template-columns: 1fr; }
    }
    .chart-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 0.75rem;
      padding: 1.5rem;
    }
    .chart-title { font-size: 1rem; font-weight: 600; margin-bottom: 1rem; color: #fff; }
    .chart-box { position: relative; height: 260px; width: 100%; }
    
    .table-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 0.75rem;
      overflow: hidden;
    }
    .table-header { padding: 1.25rem 1.5rem; border-bottom: 1px solid var(--card-border); font-weight: 600; }
    table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    th { text-align: left; padding: 0.75rem 1.5rem; background: rgba(0,0,0,0.2); color: var(--text-muted); font-size: 0.75rem; text-transform: uppercase; }
    td { padding: 0.875rem 1.5rem; border-top: 1px solid var(--card-border); font-family: 'JetBrains Mono', monospace; }
    
    .status-badge {
      display: inline-block;
      padding: 0.2rem 0.6rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
    }
    .badge-success { background: rgba(16, 185, 129, 0.15); color: #34d399; }
    .badge-danger { background: rgba(239, 68, 68, 0.15); color: #f87171; }
    .badge-primary { background: rgba(99, 102, 241, 0.15); color: #818cf8; }
  </style>
</head>
<body>
  <div class="sidebar">
    <div class="logo">
      MiniAlgothon LoadTest
    </div>

    <div class="section-title">Test Controller</div>
    
    <div class="control-group">
      <label>Scenario</label>
      <select id="selScenario">
        <option value="read">Gateway Read Benchmark</option>
        <option value="submissions">Submissions Stress</option>
        <option value="burst">Sandbox /run Burst</option>
        <option value="cleanup">Cleanup Test Data</option>
      </select>
    </div>

    <div class="control-group">
      <label>Profile</label>
      <select id="selProfile">
        <option value="smoke">Smoke (5 Users / Fast)</option>
        <option value="light">Light (20 Users)</option>
        <option value="medium">Medium (50 Users)</option>
        <option value="heavy">Heavy (100 Users)</option>
        <option value="extreme">Extreme (250 Users)</option>
      </select>
    </div>

    <div class="control-group">
      <label>Concurrency Override (Optional)</label>
      <input type="number" id="inpConcurrency" placeholder="Default for profile">
    </div>

    <button class="btn" id="btnRun" onclick="runTest()">Run Load Test</button>

    <div style="margin-top: 1.5rem;" class="section-title">Past Test Runs</div>
    <div class="reports-list" id="reportsList">
      <div style="color: var(--text-muted); font-size: 0.8rem; padding: 0.5rem;">Loading reports...</div>
    </div>
  </div>

  <div class="main-content">
    <div class="top-banner">
      <div>
        <h2 id="reportHeaderTitle" style="font-size: 1.25rem; font-weight: 700;">Load Test Results Dashboard</h2>
        <div id="reportHeaderMeta" style="color: var(--text-muted); font-size: 0.8rem; margin-top: 0.25rem;">
          Select a report from the sidebar or execute a test
        </div>
      </div>
      <div>
        <a href="http://localhost:3002" target="_blank" style="background: var(--card-border); color: #fff; text-decoration: none; padding: 0.5rem 1rem; border-radius: 0.375rem; font-size: 0.75rem; font-weight: 600;">
          Open Server Grafana
        </a>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Total Requests</div>
        <div class="stat-value" id="valTotalReq">-</div>
        <div class="stat-sub" id="valSuccessRate">-</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Throughput</div>
        <div class="stat-value" id="valThroughput">-</div>
        <div class="stat-sub">Requests per second</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">P50 Latency (Median)</div>
        <div class="stat-value" id="valP50">-</div>
        <div class="stat-sub">50%% faster than</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">P95 Latency</div>
        <div class="stat-value" id="valP95">-</div>
        <div class="stat-sub">95th percentile</div>
      </div>
    </div>

    <div class="charts-grid">
      <div class="chart-card">
        <div class="chart-title">Response Latency Distribution (ms)</div>
        <div class="chart-box">
          <canvas id="latencyChart"></canvas>
        </div>
      </div>
      <div class="chart-card">
        <div class="chart-title" id="secondaryChartTitle">Outcomes / Verdicts</div>
        <div class="chart-box">
          <canvas id="secondaryChart"></canvas>
        </div>
      </div>
    </div>

    <div class="table-card">
      <div class="table-header">Execution Metrics</div>
      <table>
        <thead>
          <tr>
            <th>Parameter</th>
            <th>Value</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody id="metricsTableBody">
        </tbody>
      </table>
    </div>
  </div>

  <script>
    let latencyChartInstance = null;
    let secondaryChartInstance = null;

    function formatDuration(ns) {
      if (!ns) return "0ms";
      const ms = ns / 1000000;
      if (ms >= 1000) return (ms / 1000).toFixed(2) + "s";
      return ms.toFixed(1) + "ms";
    }

    async function loadReports() {
      try {
        const res = await fetch('/api/reports');
        const list = await res.json();
        const container = document.getElementById('reportsList');
        container.innerHTML = '';
        if (list.length === 0) {
          container.innerHTML = '<div style="color:var(--text-muted);font-size:0.8rem;">No test runs found</div>';
          return;
        }

        list.forEach((r, idx) => {
          const div = document.createElement('div');
          div.className = 'report-item' + (idx === 0 ? ' active' : '');
          div.onclick = () => selectReport(r.id, div);
          div.innerHTML = '<div class="report-title">' + r.scenario.toUpperCase() + ' (' + r.profile + ')</div>' +
            '<div class="report-meta">' + new Date(r.timestamp).toLocaleTimeString() + ' &bull; ' + r.id.substring(r.id.lastIndexOf('_')+1) + '</div>';
          container.appendChild(div);
        });

        if (list.length > 0) {
          selectReport(list[0].id, container.firstChild);
        }
      } catch (err) {
        console.error(err);
      }
    }

    async function selectReport(id, element) {
      document.querySelectorAll('.report-item').forEach(el => el.classList.remove('active'));
      if (element) element.classList.add('active');

      try {
        const res = await fetch('/api/reports/' + id);
        const data = await res.json();
        renderReportData(data);
      } catch (err) {
        console.error(err);
      }
    }

    function renderReportData(data) {
      document.getElementById('reportHeaderTitle').innerText = data.title + ' (' + data.profileName + ')';
      document.getElementById('reportHeaderMeta').innerText = 'Target: ' + data.targetUrl + ' • ' + new Date(data.timestamp).toLocaleString();

      const lm = data.latencyMetrics || {};
      const total = lm.totalRequests || 0;
      const success = lm.successCount || 0;
      const pct = total > 0 ? ((success / total) * 100).toFixed(1) + '%%' : '0%%';

      document.getElementById('valTotalReq').innerText = total;
      document.getElementById('valSuccessRate').innerText = pct + ' success rate';
      document.getElementById('valThroughput').innerText = (data.throughputRps || 0).toFixed(2) + ' rps';
      document.getElementById('valP50').innerText = formatDuration(lm.p50);
      document.getElementById('valP95').innerText = formatDuration(lm.p95);

      // Latency Chart
      const ctxLat = document.getElementById('latencyChart').getContext('2d');
      if (latencyChartInstance) latencyChartInstance.destroy();
      latencyChartInstance = new Chart(ctxLat, {
        type: 'bar',
        data: {
          labels: ['Min', 'P50 (Median)', 'P90', 'P95', 'P99', 'Max'],
          datasets: [{
            data: [
              (lm.min||0)/1000000,
              (lm.p50||0)/1000000,
              (lm.p90||0)/1000000,
              (lm.p95||0)/1000000,
              (lm.p99||0)/1000000,
              (lm.max||0)/1000000
            ],
            backgroundColor: [
              'rgba(16, 185, 129, 0.7)',
              'rgba(99, 102, 241, 0.7)',
              'rgba(59, 130, 246, 0.7)',
              'rgba(245, 158, 11, 0.7)',
              'rgba(239, 68, 68, 0.7)',
              'rgba(220, 38, 38, 0.9)'
            ],
            borderRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { grid: { color: '#1f293d' }, ticks: { color: '#94a3b8' } },
            x: { grid: { display: false }, ticks: { color: '#94a3b8' } }
          }
        }
      });

      // Secondary Chart
      const ctxSec = document.getElementById('secondaryChart').getContext('2d');
      if (secondaryChartInstance) secondaryChartInstance.destroy();

      if (data.verdictBreakdown && Object.keys(data.verdictBreakdown).length > 0) {
        document.getElementById('secondaryChartTitle').innerText = 'Submissions Verdict Breakdown';
        secondaryChartInstance = new Chart(ctxSec, {
          type: 'doughnut',
          data: {
            labels: Object.keys(data.verdictBreakdown),
            datasets: [{
              data: Object.values(data.verdictBreakdown),
              backgroundColor: ['#10b981', '#ef4444', '#f59e0b', '#6366f1', '#8b5cf6']
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8' } } }
          }
        });
      } else {
        document.getElementById('secondaryChartTitle').innerText = 'Request Success vs Fail';
        secondaryChartInstance = new Chart(ctxSec, {
          type: 'doughnut',
          data: {
            labels: ['Success', 'Failed'],
            datasets: [{
              data: [lm.successCount||0, lm.failCount||0],
              backgroundColor: ['#10b981', '#ef4444']
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8' } } }
          }
        });
      }

      // Table
      const tbody = document.getElementById('metricsTableBody');
      tbody.innerHTML = '';
      const rows = [
        ['Scenario', data.scenarioName, 'Execution type'],
        ['Profile', data.profileName, 'Configured load tier'],
        ['Contestants / Users', data.totalUsers, 'Total simulated sessions'],
        ['Concurrency Limit', data.concurrencyLimit, 'Maximum concurrent active workers'],
        ['Elapsed Duration', formatDuration(data.elapsedDuration), 'Total test wall-clock time'],
        ['Throughput', (data.throughputRps || 0).toFixed(2) + ' req/s', 'Processed requests per second'],
        ['P50 Latency', formatDuration(lm.p50), '50th percentile (median)'],
        ['P95 Latency', formatDuration(lm.p95), '95th percentile latency'],
        ['P99 Latency', formatDuration(lm.p99), '99th percentile latency'],
        ['Max Latency', formatDuration(lm.max), 'Slowest recorded request']
      ];
      rows.forEach(([k, v, d]) => {
        const tr = document.createElement('tr');
        tr.innerHTML = '<td><strong>' + k + '</strong></td><td>' + v + '</td><td style="color:var(--text-muted);font-family:sans-serif;">' + d + '</td>';
        tbody.appendChild(tr);
      });
    }

    async function runTest() {
      const btn = document.getElementById('btnRun');
      btn.disabled = true;
      btn.innerText = 'Running Test...';

      const scenario = document.getElementById('selScenario').value;
      const profile = document.getElementById('selProfile').value;
      const concurrency = parseInt(document.getElementById('inpConcurrency').value) || 0;

      try {
        const res = await fetch('/api/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scenario, profile, concurrency })
        });
        const data = await res.json();
        if (data.report) {
          renderReportData(data.report);
        }
        await loadReports();
      } catch (err) {
        alert('Test failed: ' + err.message);
      } finally {
        btn.disabled = false;
        btn.innerText = 'Run Load Test';
      }
    }

    loadReports();
  </script>
</body>
</html>
`
