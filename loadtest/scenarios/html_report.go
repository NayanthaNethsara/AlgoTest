package scenarios

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

func GenerateHTMLReport(outputDir string, report *TestExecutionReport) (string, error) {
	_ = os.MkdirAll(outputDir, 0755)
	timestamp := time.Now().Format("20060102_150405")
	baseFilename := fmt.Sprintf("report_%s_%s_%s", report.ScenarioName, report.ProfileName, timestamp)
	htmlPath := filepath.Join(outputDir, baseFilename+".html")

	jsonData, err := json.Marshal(report)
	if err != nil {
		return "", err
	}

	htmlContent := fmt.Sprintf(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Load Test Report: %s (%s)</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
  <style>
    :root {
      --bg: #090d16;
      --card-bg: #111726;
      --card-border: #1f293d;
      --text: #f1f5f9;
      --text-muted: #94a3b8;
      --primary: #6366f1;
      --success: #10b981;
      --warning: #f59e0b;
      --danger: #ef4444;
      --info: #06b6d4;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg);
      color: var(--text);
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      padding: 2.5rem 1.5rem;
      min-height: 100vh;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 2rem;
      padding-bottom: 1.5rem;
      border-bottom: 1px solid var(--card-border);
    }
    h1 { font-size: 1.75rem; font-weight: 700; color: #fff; margin-bottom: 0.5rem; }
    .subtitle { color: var(--text-muted); font-size: 0.875rem; }
    .badge {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .badge-primary { background: rgba(99, 102, 241, 0.15); color: #818cf8; border: 1px solid rgba(99, 102, 241, 0.3); }
    .badge-success { background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); }
    .badge-danger { background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); }
    
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }
    .stat-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 0.75rem;
      padding: 1.25rem;
    }
    .stat-label { font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); font-weight: 600; letter-spacing: 0.05em; }
    .stat-value { font-size: 1.75rem; font-weight: 700; color: #fff; margin-top: 0.25rem; font-family: 'JetBrains Mono', monospace; }
    .stat-sub { font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem; }
    
    .charts-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(500px, 1fr));
      gap: 1.5rem;
      margin-bottom: 2rem;
    }
    @media (max-width: 600px) {
      .charts-grid { grid-template-columns: 1fr; }
    }
    .chart-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 0.75rem;
      padding: 1.5rem;
    }
    .chart-title { font-size: 1rem; font-weight: 600; margin-bottom: 1rem; color: #fff; }
    .chart-box { position: relative; height: 260px; width: 100%%; }
    
    .table-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 0.75rem;
      overflow: hidden;
      margin-bottom: 2rem;
    }
    .table-header { padding: 1.25rem 1.5rem; border-bottom: 1px solid var(--card-border); font-weight: 600; font-size: 1rem; }
    table { width: 100%%; border-collapse: collapse; font-size: 0.875rem; }
    th { text-align: left; padding: 0.75rem 1.5rem; background: rgba(0,0,0,0.2); color: var(--text-muted); font-size: 0.75rem; text-transform: uppercase; font-weight: 600; }
    td { padding: 0.875rem 1.5rem; border-top: 1px solid var(--card-border); font-family: 'JetBrains Mono', monospace; }
    
    .footer {
      text-align: center;
      color: var(--text-muted);
      font-size: 0.75rem;
      padding-top: 1.5rem;
      border-top: 1px solid var(--card-border);
    }
    .grafana-banner {
      background: linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(16, 185, 129, 0.1));
      border: 1px solid rgba(99, 102, 241, 0.3);
      border-radius: 0.75rem;
      padding: 1rem 1.25rem;
      margin-bottom: 2rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .grafana-btn {
      background: var(--primary);
      color: #fff;
      text-decoration: none;
      padding: 0.5rem 1rem;
      border-radius: 0.375rem;
      font-size: 0.75rem;
      font-weight: 600;
      transition: opacity 0.2s;
    }
    .grafana-btn:hover { opacity: 0.9; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div>
        <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem;">
          <h1>%s</h1>
          <span class="badge badge-primary">%s</span>
        </div>
        <p class="subtitle">Target: <strong>%s</strong> &bull; Generated: %s</p>
      </div>
      <div>
        <span class="badge badge-success">COMPLETED</span>
      </div>
    </header>

    <div class="grafana-banner">
      <div>
        <div style="font-weight: 600; font-size: 0.875rem;">Live Server Telemetry Available</div>
        <div style="font-size: 0.75rem; color: var(--text-muted);">View Host CPU, PostgreSQL connection pool, and Worker Sandbox concurrency in Grafana</div>
      </div>
      <a href="http://localhost:3002" target="_blank" class="grafana-btn">Open Grafana (Port 3002)</a>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Total Requests</div>
        <div class="stat-value" id="valTotalReq">-</div>
        <div class="stat-sub" id="valSuccessRate">-</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Effective Throughput</div>
        <div class="stat-value" id="valThroughput">-</div>
        <div class="stat-sub">Requests per second</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">P50 Latency (Median)</div>
        <div class="stat-value" id="valP50">-</div>
        <div class="stat-sub">Half of requests faster than</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">P95 Latency</div>
        <div class="stat-value" id="valP95">-</div>
        <div class="stat-sub">95th percentile response time</div>
      </div>
    </div>

    <div class="charts-grid">
      <div class="chart-card">
        <div class="chart-title">Latency Percentiles (ms)</div>
        <div class="chart-box">
          <canvas id="latencyChart"></canvas>
        </div>
      </div>
      <div class="chart-card">
        <div class="chart-title" id="secondaryChartTitle">Verdicts / Status Distribution</div>
        <div class="chart-box">
          <canvas id="secondaryChart"></canvas>
        </div>
      </div>
    </div>

    <div class="table-card">
      <div class="table-header">Detailed Test Metrics</div>
      <table>
        <thead>
          <tr>
            <th>Metric</th>
            <th>Value</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody id="metricsTableBody">
        </tbody>
      </table>
    </div>

    <div class="footer">
      MiniAlgothon Standalone Load Testing Suite &bull; Exported from %s
    </div>
  </div>

  <script>
    const reportData = %s;

    function formatDuration(ns) {
      if (!ns) return "0ms";
      const ms = ns / 1000000;
      if (ms >= 1000) {
        return (ms / 1000).toFixed(2) + "s";
      }
      return ms.toFixed(1) + "ms";
    }

    function renderDashboard() {
      const lm = reportData.latencyMetrics || {};
      const total = lm.totalRequests || 0;
      const success = lm.successCount || 0;
      const successRate = total > 0 ? ((success / total) * 100).toFixed(1) + "%% success" : "0%%";

      document.getElementById('valTotalReq').innerText = total;
      document.getElementById('valSuccessRate').innerText = successRate;
      document.getElementById('valThroughput').innerText = (reportData.throughputRps || 0).toFixed(2) + " rps";
      document.getElementById('valP50').innerText = formatDuration(lm.p50);
      document.getElementById('valP95').innerText = formatDuration(lm.p95);

      // Render Latency Bar Chart
      const ctxLatency = document.getElementById('latencyChart').getContext('2d');
      new Chart(ctxLatency, {
        type: 'bar',
        data: {
          labels: ['Min', 'P50 (Median)', 'P90', 'P95', 'P99', 'Max'],
          datasets: [{
            label: 'Response Latency (ms)',
            data: [
              (lm.min || 0) / 1000000,
              (lm.p50 || 0) / 1000000,
              (lm.p90 || 0) / 1000000,
              (lm.p95 || 0) / 1000000,
              (lm.p99 || 0) / 1000000,
              (lm.max || 0) / 1000000,
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
            y: {
              grid: { color: '#1f293d' },
              ticks: { color: '#94a3b8' }
            },
            x: {
              grid: { display: false },
              ticks: { color: '#94a3b8' }
            }
          }
        }
      });

      // Render Secondary Chart (Verdict or Success/Fail)
      const ctxSecondary = document.getElementById('secondaryChart').getContext('2d');
      if (reportData.verdictBreakdown && Object.keys(reportData.verdictBreakdown).length > 0) {
        document.getElementById('secondaryChartTitle').innerText = 'Submissions Verdict Breakdown';
        const labels = Object.keys(reportData.verdictBreakdown);
        const data = Object.values(reportData.verdictBreakdown);
        new Chart(ctxSecondary, {
          type: 'doughnut',
          data: {
            labels: labels,
            datasets: [{
              data: data,
              backgroundColor: ['#10b981', '#ef4444', '#f59e0b', '#6366f1', '#8b5cf6']
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { position: 'bottom', labels: { color: '#94a3b8' } }
            }
          }
        });
      } else {
        document.getElementById('secondaryChartTitle').innerText = 'Request Success vs Fail';
        new Chart(ctxSecondary, {
          type: 'doughnut',
          data: {
            labels: ['Success', 'Failed / Stalled'],
            datasets: [{
              data: [lm.successCount || 0, lm.failCount || 0],
              backgroundColor: ['#10b981', '#ef4444']
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { position: 'bottom', labels: { color: '#94a3b8' } }
            }
          }
        });
      }

      // Populate Table
      const tbody = document.getElementById('metricsTableBody');
      const rows = [
        ['Scenario', reportData.scenarioName, 'Execution type'],
        ['Profile', reportData.profileName, 'Configured load tier'],
        ['Contestants / Users', reportData.totalUsers, 'Total simulated sessions'],
        ['Concurrency Limit', reportData.concurrencyLimit, 'Maximum concurrent active workers'],
        ['Elapsed Duration', formatDuration(reportData.elapsedDuration), 'Total test wall-clock time'],
        ['Throughput', (reportData.throughputRps || 0).toFixed(2) + ' req/s', 'Processed requests per second'],
        ['Min Latency', formatDuration(lm.min), 'Fastest recorded request'],
        ['Average Latency', formatDuration(lm.average), 'Mean response time'],
        ['P50 Latency', formatDuration(lm.p50), '50th percentile (median)'],
        ['P90 Latency', formatDuration(lm.p90), '90th percentile latency'],
        ['P95 Latency', formatDuration(lm.p95), '95th percentile latency'],
        ['P99 Latency', formatDuration(lm.p99), '99th percentile latency'],
        ['Max Latency', formatDuration(lm.max), 'Slowest recorded request']
      ];

      if (reportData.additionalDetails) {
        for (const [k, v] of Object.entries(reportData.additionalDetails)) {
          rows.push([k, v, 'Configured scenario parameter']);
        }
      }

      rows.forEach(([k, v, d]) => {
        const tr = document.createElement('tr');
        tr.innerHTML = '<td><strong>' + k + '</strong></td><td>' + v + '</td><td style="color:var(--text-muted);font-family:sans-serif;">' + d + '</td>';
        tbody.appendChild(tr);
      });
    }

    renderDashboard();
  </script>
</body>
</html>`,
		report.Title,
		report.ProfileName,
		report.Title,
		report.ProfileName,
		report.TargetURL,
		report.Timestamp,
		report.TargetURL,
		string(jsonData),
	)

	err = os.WriteFile(htmlPath, []byte(htmlContent), 0644)
	if err != nil {
		return "", err
	}

	return htmlPath, nil
}
