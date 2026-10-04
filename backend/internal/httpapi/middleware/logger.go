package middleware

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"log/slog"
	"net"
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

const maxCapture = 4096

var errNoHijack = errors.New("upstream ResponseWriter does not implement http.Hijacker")

// bodyCaptureWriter captures response body (bounded) AND forwards Hijack/Flush
// so WebSocket upgrades and streaming keep working through the logger.
type bodyCaptureWriter struct {
	http.ResponseWriter
	buf *bytes.Buffer
}

func (b *bodyCaptureWriter) Write(p []byte) (int, error) {
	if b.buf != nil && b.buf.Len() < maxCapture {
		b.buf.Write(p)
	}
	return b.ResponseWriter.Write(p)
}

// Hijack delegates to the underlying writer (required by gorilla websocket).
func (b *bodyCaptureWriter) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	hj, ok := b.ResponseWriter.(http.Hijacker)
	if !ok {
		return nil, nil, errNoHijack
	}
	return hj.Hijack()
}

// Flush delegates for streaming/SSE responses.
func (b *bodyCaptureWriter) Flush() {
	if f, ok := b.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

type errEnvelope struct {
	Error struct {
		Code    string         `json:"code"`
		Message string         `json:"message"`
		Details map[string]any `json:"details"`
	} `json:"error"`
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}

// ColoredLogger emits a colored, structured request log. For 4xx/5xx it also
// extracts code/message/details from the JSON error envelope so failures are
// fully diagnosable from server logs alone.
func ColoredLogger(logger *slog.Logger) func(http.Handler) http.Handler {
	_ = logger
	reqLogger := slog.New(logging.NewConsoleHandler(slog.LevelInfo))

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			ww := chimw.NewWrapResponseWriter(w, r.ProtoMajor)

			var bodyBuf bytes.Buffer
			capture := &bodyCaptureWriter{ResponseWriter: ww, buf: &bodyBuf}

			next.ServeHTTP(capture, r)

			level := slog.LevelInfo
			if ww.Status() >= 500 {
				level = slog.LevelError
			} else if ww.Status() >= 400 {
				level = slog.LevelWarn
			}

			args := []any{
				"log_id", logging.NewLogID(),
				"user_id", ww.Header().Get("X-User-ID"),
				"ip", clientIP(r),
				"url", r.Method + " " + r.URL.Path,
				"status", ww.Status(),
				"duration_ms", time.Since(start).Milliseconds(),
				"request_id", chimw.GetReqID(r.Context()),
			}

			if ww.Status() >= 400 && bodyBuf.Len() > 0 {
				var env errEnvelope
				if err := json.Unmarshal(bodyBuf.Bytes(), &env); err == nil && env.Error.Code != "" {
					args = append(args, "error_code", env.Error.Code)
					if env.Error.Message != "" {
						args = append(args, "error_message", truncate(env.Error.Message, 300))
					}
					if len(env.Error.Details) > 0 {
						if dj, err := json.Marshal(env.Error.Details); err == nil {
							args = append(args, "error_details", truncate(string(dj), 300))
						}
					}
				}
			}

			reqLogger.Log(r.Context(), level, "http request", args...)
		})
	}
}
