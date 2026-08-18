package metrics

import (
	"context"
	"strconv"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

var (
	HTTPRequestsTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Namespace: "algothon",
			Subsystem: "http",
			Name:      "requests_total",
			Help:      "Total number of HTTP requests processed by method, route, and status code.",
		},
		[]string{"method", "route", "status"},
	)

	HTTPRequestDuration = promauto.NewHistogramVec(
		prometheus.HistogramOpts{
			Namespace: "algothon",
			Subsystem: "http",
			Name:      "request_duration_seconds",
			Help:      "Duration of HTTP requests in seconds.",
			Buckets:   []float64{0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10},
		},
		[]string{"method", "route", "status"},
	)

	HTTPRequestsInFlight = promauto.NewGauge(
		prometheus.GaugeOpts{
			Namespace: "algothon",
			Subsystem: "http",
			Name:      "requests_in_flight",
			Help:      "Current number of in-flight HTTP requests.",
		},
	)

	HTTPRequestSizeBytes = promauto.NewSummaryVec(
		prometheus.SummaryOpts{
			Namespace: "algothon",
			Subsystem: "http",
			Name:      "request_size_bytes",
			Help:      "Size of HTTP request bodies in bytes.",
		},
		[]string{"method", "route"},
	)

	HTTPResponseSizeBytes = promauto.NewSummaryVec(
		prometheus.SummaryOpts{
			Namespace: "algothon",
			Subsystem: "http",
			Name:      "response_size_bytes",
			Help:      "Size of HTTP response bodies in bytes.",
		},
		[]string{"method", "route"},
	)

	JudgeSubmissionsTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Namespace: "algothon",
			Subsystem: "judge",
			Name:      "submissions_total",
			Help:      "Total number of submissions judged by language and verdict.",
		},
		[]string{"language", "verdict"},
	)

	JudgeSubmissionsQueuedTotal = promauto.NewCounter(
		prometheus.CounterOpts{
			Namespace: "algothon",
			Subsystem: "judge",
			Name:      "submissions_queued_total",
			Help:      "Total number of submissions accepted into the queue.",
		},
	)

	JudgeSubmissionsActive = promauto.NewGauge(
		prometheus.GaugeOpts{
			Namespace: "algothon",
			Subsystem: "judge",
			Name:      "submissions_active",
			Help:      "Number of submissions currently being evaluated.",
		},
	)

	JudgeWorkersActive = promauto.NewGauge(
		prometheus.GaugeOpts{
			Namespace: "algothon",
			Subsystem: "judge",
			Name:      "workers_active",
			Help:      "Configured number of active judge worker goroutines.",
		},
	)

	JudgeExecutionDuration = promauto.NewHistogramVec(
		prometheus.HistogramOpts{
			Namespace: "algothon",
			Subsystem: "judge",
			Name:      "execution_duration_seconds",
			Help:      "Duration of submission compilation and execution phases in seconds.",
			Buckets:   []float64{0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 30},
		},
		[]string{"language", "phase"},
	)

	RunnerBoxesActive = promauto.NewGauge(
		prometheus.GaugeOpts{
			Namespace: "algothon",
			Subsystem: "runner",
			Name:      "boxes_active",
			Help:      "Number of isolate sandbox boxes currently in use.",
		},
	)

	RunnerBoxesCapacity = promauto.NewGauge(
		prometheus.GaugeOpts{
			Namespace: "algothon",
			Subsystem: "runner",
			Name:      "boxes_capacity",
			Help:      "Total number of isolate sandbox boxes configured.",
		},
	)

	RunnerQueueDepth = promauto.NewGauge(
		prometheus.GaugeOpts{
			Namespace: "algothon",
			Subsystem: "runner",
			Name:      "queue_depth",
			Help:      "Number of execution requests currently waiting in the runner queue.",
		},
	)
)

type DBPoolCollector struct {
	pool *pgxpool.Pool

	totalConnsDesc   *prometheus.Desc
	idleConnsDesc    *prometheus.Desc
	acquiredConnsDesc *prometheus.Desc
	maxConnsDesc     *prometheus.Desc
	acquireCountDesc *prometheus.Desc
	acquireDurationDesc *prometheus.Desc
	emptyAcquireDesc *prometheus.Desc
	canceledAcquireDesc *prometheus.Desc
}

func NewDBPoolCollector(pool *pgxpool.Pool) *DBPoolCollector {
	return &DBPoolCollector{
		pool: pool,
		totalConnsDesc: prometheus.NewDesc(
			"algothon_db_pool_total_connections",
			"Current total number of open database connections in the pool.",
			nil, nil,
		),
		idleConnsDesc: prometheus.NewDesc(
			"algothon_db_pool_idle_connections",
			"Current number of idle database connections in the pool.",
			nil, nil,
		),
		acquiredConnsDesc: prometheus.NewDesc(
			"algothon_db_pool_acquired_connections",
			"Current number of database connections actively checked out of the pool.",
			nil, nil,
		),
		maxConnsDesc: prometheus.NewDesc(
			"algothon_db_pool_max_connections",
			"Maximum number of connections allowed in the database pool.",
			nil, nil,
		),
		acquireCountDesc: prometheus.NewDesc(
			"algothon_db_pool_acquire_count_total",
			"Cumulative number of successful connection acquisitions from the pool.",
			nil, nil,
		),
		acquireDurationDesc: prometheus.NewDesc(
			"algothon_db_pool_acquire_duration_seconds_total",
			"Total time spent waiting to acquire connections from the pool.",
			nil, nil,
		),
		emptyAcquireDesc: prometheus.NewDesc(
			"algothon_db_pool_empty_acquire_total",
			"Cumulative number of times a connection acquire had to wait for a free connection.",
			nil, nil,
		),
		canceledAcquireDesc: prometheus.NewDesc(
			"algothon_db_pool_canceled_acquire_total",
			"Cumulative number of connection acquisitions canceled due to context timeouts.",
			nil, nil,
		),
	}
}

func (c *DBPoolCollector) Describe(ch chan<- *prometheus.Desc) {
	ch <- c.totalConnsDesc
	ch <- c.idleConnsDesc
	ch <- c.acquiredConnsDesc
	ch <- c.maxConnsDesc
	ch <- c.acquireCountDesc
	ch <- c.acquireDurationDesc
	ch <- c.emptyAcquireDesc
	ch <- c.canceledAcquireDesc
}

func (c *DBPoolCollector) Collect(ch chan<- prometheus.Metric) {
	if c.pool == nil {
		return
	}

	stat := c.pool.Stat()

	ch <- prometheus.MustNewConstMetric(c.totalConnsDesc, prometheus.GaugeValue, float64(stat.TotalConns()))
	ch <- prometheus.MustNewConstMetric(c.idleConnsDesc, prometheus.GaugeValue, float64(stat.IdleConns()))
	ch <- prometheus.MustNewConstMetric(c.acquiredConnsDesc, prometheus.GaugeValue, float64(stat.AcquiredConns()))
	ch <- prometheus.MustNewConstMetric(c.maxConnsDesc, prometheus.GaugeValue, float64(stat.MaxConns()))
	ch <- prometheus.MustNewConstMetric(c.acquireCountDesc, prometheus.CounterValue, float64(stat.AcquireCount()))
	ch <- prometheus.MustNewConstMetric(c.acquireDurationDesc, prometheus.CounterValue, stat.AcquireDuration().Seconds())
	ch <- prometheus.MustNewConstMetric(c.emptyAcquireDesc, prometheus.CounterValue, float64(stat.EmptyAcquireCount()))
	ch <- prometheus.MustNewConstMetric(c.canceledAcquireDesc, prometheus.CounterValue, float64(stat.CanceledAcquireCount()))
}

var (
	dbPoolCollectorOnce sync.Once
)

func RegisterDBPoolCollector(pool *pgxpool.Pool) {
	if pool != nil {
		dbPoolCollectorOnce.Do(func() {
			_ = prometheus.Register(NewDBPoolCollector(pool))
		})
	}
}

func StartRunnerMetricsReporter(ctx context.Context, statsFn func() (activeBoxes, capacity, queueDepth int), interval time.Duration) {
	if statsFn == nil {
		return
	}
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				active, capBoxes, queueDepth := statsFn()
				RunnerBoxesActive.Set(float64(active))
				RunnerBoxesCapacity.Set(float64(capBoxes))
				RunnerQueueDepth.Set(float64(queueDepth))
			}
		}
	}()
}

func RecordSubmissionQueued() {
	JudgeSubmissionsQueuedTotal.Inc()
}

func RecordSubmissionCompleted(language, verdict string, duration time.Duration) {
	JudgeSubmissionsTotal.WithLabelValues(language, verdict).Inc()
	JudgeExecutionDuration.WithLabelValues(language, "total").Observe(duration.Seconds())
}

func RecordPhaseDuration(language, phase string, duration time.Duration) {
	JudgeExecutionDuration.WithLabelValues(language, phase).Observe(duration.Seconds())
}

func FormatStatusCode(code int) string {
	return strconv.Itoa(code)
}

