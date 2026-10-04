package middleware

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"
	"time"

	chimw "github.com/go-chi/chi/v5/middleware"

	"github.com/neuralforgeio/StockKit/internal/logging"
)

func clientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		return strings.TrimSpace(strings.Split(xff, ",")[0])
	}
	if rip := r.Header.Get("X-Real-IP"); rip != "" {
		return strings.TrimSpace(rip)
	}
	host := r.RemoteAddr
	if i := strings.LastIndex(host, ":"); i > 0 {
		return host[:i]
	}
	return host
}

// ColoredLogger emits a colored, structured request log with required fields:
// timestamp, level, message, log_id, user_id, ip, url, status, duration, request_id.
// Reads user_id from X-User-ID response header (set by AuthN middleware).
func ColoredLogger(logger *slog.Logger) func(http.Handler) http.Handler {
	_ = logger
	reqLogger := slog.New(logging.NewConsoleHandler(slog.LevelInfo))

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			ww := chimw.NewWrapResponseWriter(w, r.ProtoMajor)
			next.ServeHTTP(ww, r)

			level := slog.LevelInfo
			var errorCode string
			if ww.Status() >= 500 {
				level = slog.LevelError
				// Try to extract error code from response body for better visibility
				if body := ww.Bytes(); len(body) > 0 {
					var envelope struct {
						Error struct {
							Code string `json:"code"`
						} `json:"error"`
					}
					if json.Unmarshal(body, &envelope) == nil && envelope.Error.Code != "" {
						errorCode = envelope.Error.Code
					}
				}
			} else if ww.Status() >= 400 {
				level = slog.LevelWarn
			}

			userID := ww.Header().Get("X-User-ID")

			args := []any{
				"log_id", logging.NewLogID(),
				"user_id", userID,
				"ip", clientIP(r),
				"url", r.Method + " " + r.URL.Path,
				"status", ww.Status(),
				"duration_ms", time.Since(start).Milliseconds(),
				"request_id", chimw.GetReqID(r.Context()),
			}
			if errorCode != "" {
				args = append(args, "error_code", errorCode)
			}

			reqLogger.Log(r.Context(), level, "http request", args...)
		})
	}
}
