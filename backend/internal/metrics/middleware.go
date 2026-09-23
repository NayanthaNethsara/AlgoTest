package metrics

import (
	"log/slog"
	"reflect"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// HeaderRequestID is the standard HTTP header for correlation IDs.
const HeaderRequestID = "X-Request-ID"

// ContextRequestIDKey is the key under which request ID is stored in Gin context.
const ContextRequestIDKey = "request_id"

// GinRequestIDMiddleware ensures every HTTP request has a traceable unique request ID.
func GinRequestIDMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		requestID := strings.TrimSpace(c.GetHeader(HeaderRequestID))
		if requestID == "" {
			requestID = uuid.NewString()
		}
		c.Set(ContextRequestIDKey, requestID)
		c.Writer.Header().Set(HeaderRequestID, requestID)
		c.Next()
	}
}

// GinMetricsMiddleware records Prometheus metrics for each incoming HTTP request.
func GinMetricsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		HTTPRequestsInFlight.Inc()
		defer HTTPRequestsInFlight.Dec()

		if c.Request.ContentLength > 0 {
			route := resolveRoutePath(c)
			HTTPRequestSizeBytes.WithLabelValues(c.Request.Method, route).Observe(float64(c.Request.ContentLength))
		}

		c.Next()

		duration := time.Since(start)
		status := FormatStatusCode(c.Writer.Status())
		route := resolveRoutePath(c)

		HTTPRequestsTotal.WithLabelValues(c.Request.Method, route, status).Inc()
		HTTPRequestDuration.WithLabelValues(c.Request.Method, route, status).Observe(duration.Seconds())

		responseSize := c.Writer.Size()
		if responseSize > 0 {
			HTTPResponseSizeBytes.WithLabelValues(c.Request.Method, route).Observe(float64(responseSize))
		}
	}
}

// GinStructuredLoggingMiddleware emits structured slog JSON records for Loki ingestion.
func GinStructuredLoggingMiddleware(log *slog.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()

		c.Next()

		if log == nil {
			return
		}

		duration := time.Since(start)
		status := c.Writer.Status()
		route := resolveRoutePath(c)
		path := c.Request.URL.Path
		requestID := c.GetString(ContextRequestIDKey)
		if requestID == "" {
			requestID = c.Writer.Header().Get(HeaderRequestID)
		}

		attrs := []slog.Attr{
			slog.String("request_id", requestID),
			slog.String("method", c.Request.Method),
			slog.String("path", path),
			slog.String("route", route),
			slog.Int("status", status),
			slog.Float64("duration_ms", float64(duration.Microseconds())/1000.0),
			slog.String("client_ip", c.ClientIP()),
			slog.Int("bytes_out", c.Writer.Size()),
		}

		if query := c.Request.URL.RawQuery; query != "" {
			attrs = append(attrs, slog.String("query", query))
		}

		if rawUser, exists := c.Get("user"); exists && rawUser != nil {
			if id := extractStructID(rawUser); id != "" {
				attrs = append(attrs, slog.String("user_id", id))
			}
		}

		if rawAgent, exists := c.Get("proctor_agent"); exists && rawAgent != nil {
			if id := extractStructID(rawAgent); id != "" {
				attrs = append(attrs, slog.String("agent_id", id))
			}
		}

		if len(c.Errors) > 0 {
			attrs = append(attrs, slog.String("error", c.Errors.String()))
		}

		ctx := c.Request.Context()
		switch {
		case status >= 500:
			log.LogAttrs(ctx, slog.LevelError, "http_request", attrs...)
		case status >= 400:
			log.LogAttrs(ctx, slog.LevelWarn, "http_request", attrs...)
		default:
			log.LogAttrs(ctx, slog.LevelInfo, "http_request", attrs...)
		}
	}
}

func extractStructID(val any) string {
	v := reflect.ValueOf(val)
	if !v.IsValid() {
		return ""
	}
	if v.Kind() == reflect.Pointer {
		if v.IsNil() {
			return ""
		}
		v = v.Elem()
	}
	if v.Kind() == reflect.Struct {
		f := v.FieldByName("ID")
		if f.IsValid() && f.Kind() == reflect.String {
			return f.String()
		}
	}
	return ""
}

func resolveRoutePath(c *gin.Context) string {
	route := c.FullPath()
	if route != "" {
		return route
	}
	if c.Writer.Status() == 404 {
		return "not_found"
	}
	return "unmatched"
}
