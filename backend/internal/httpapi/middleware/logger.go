package middleware

import (
	"bytes"
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

// bodyCaptureWriter wraps a ResponseWriter and captures the response body (up to 4KB)
// so we can extract error codes from JSON envelopes for 5xx log visibility.
type bodyCaptureWriter struct {
	http.ResponseWriter
	buf *bytes.Buffer
}

func (b *bodyCaptureWriter) Write(p []byte) (int, error) {
	if b.buf != nil && b.buf.Len() < 4096 {
		b.buf.Write(p)
	}
	return b.ResponseWriter.Write(p)
}

// ColoredLogger emits a colored, structured request log with required fields:
// timestamp, level, message, log_id, user_id, ip, url, status, duration, request_id.
// For 5xx responses, also extracts error_code from JSON envelope body.
func ColoredLogger(logger *slog.Logger) func(http.Handler) http.Handler {
	_ = logger
	reqLogger := slog.New(logging.NewConsoleHandler(slog.LevelInfo))

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			ww := chimw.NewWrapResponseWriter(w, r.ProtoMajor)

			// Wrap ww with a body capture writer so we can inspect 5xx bodies.
			var bodyBuf bytes.Buffer
			capture := &bodyCaptureWriter{ResponseWriter: ww, buf: &bodyBuf}

			next.ServeHTTP(capture, r)

			level := slog.LevelInfo
			var errorCode string
			if ww.Status() >= 500 {
				level = slog.LevelError
				// Try to extract error code from JSON envelope
				if bodyBuf.Len() > 0 {
					var envelope struct {
						Error struct {
							Code string `json:"code"`
						} `json:"error"`
					}
					if err := json.Unmarshal(bodyBuf.Bytes(), &envelope); err == nil && envelope.Error.Code != "" {
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
