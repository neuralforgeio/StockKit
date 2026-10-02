package middleware

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"time"

	chimw "github.com/go-chi/chi/v5/middleware"

	"github.com/neuralforgeio/StockKit/internal/httpapi/httperr"
	"github.com/neuralforgeio/StockKit/internal/platform/version"
)

// Logger emits one structured access log line per request with IP address.
func Logger(l *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			ww := chimw.NewWrapResponseWriter(w, r.ProtoMajor)

			// Extract client IP with privacy-preserving hash
			clientIP := extractClientIP(r)
			ipHash := hashIP(clientIP)

			next.ServeHTTP(ww, r)

			l.Info("http request",
				"request_id", chimw.GetReqID(r.Context()),
				"method", r.Method,
				"path", r.URL.Path,
				"status", ww.Status(),
				"duration_ms", time.Since(start).Milliseconds(),
				"client_ip", clientIP,
				"client_ip_hash", ipHash,
				"user_agent", r.UserAgent(),
			)
		})
	}
}

// extractClientIP gets the real client IP from X-Forwarded-For or RemoteAddr.
func extractClientIP(r *http.Request) string {
	// Check X-Forwarded-For first (reverse proxy)
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		// Take the first IP in the chain
		parts := strings.Split(xff, ",")
		if len(parts) > 0 {
			return strings.TrimSpace(parts[0])
		}
	}

	// Check X-Real-IP
	if xri := r.Header.Get("X-Real-IP"); xri != "" {
		return xri
	}

	// Fallback to RemoteAddr
	ip, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return ip
}

// hashIP creates a privacy-preserving hash of the IP address for audit trail.
func hashIP(ip string) string {
	if ip == "" {
		return ""
	}
	// For IPv4, hash /24 subnet; for IPv6, hash /64 subnet
	if parsedIP := net.ParseIP(ip); parsedIP != nil {
		if parsedIP.To4() != nil {
			// IPv4: use first 3 octets
			parts := strings.Split(ip, ".")
			if len(parts) >= 3 {
				ip = strings.Join(parts[:3], ".") + ".0"
			}
		} else {
			// IPv6: use first 4 groups
			parts := strings.Split(ip, ":")
			if len(parts) >= 4 {
				ip = strings.Join(parts[:4], ":") + "::"
			}
		}
	}

	hash := sha256.Sum256([]byte(ip))
	return hex.EncodeToString(hash[:8])
}

// Recoverer converts panics into INTERNAL envelope responses.
func Recoverer(l *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			defer func() {
				if rv := recover(); rv != nil {
					l.Error("panic recovered",
						"error", fmt.Sprint(rv),
						"request_id", chimw.GetReqID(r.Context()),
						"client_ip", extractClientIP(r),
					)
					httperr.Write(w, httperr.New("INTERNAL", http.StatusInternalServerError, "Internal server error"))
				}
			}()
			next.ServeHTTP(w, r)
		})
	}
}

// VersionHeader stamps every response with X-StockKit-Version.
func VersionHeader(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-StockKit-Version", version.Get().Version)
		next.ServeHTTP(w, r)
	})
}

// SecurityHeaders applies the baseline response hardening headers.
func SecurityHeaders(next http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			h := w.Header()
			h.Set("X-Content-Type-Options", "nosniff")
			h.Set("Referrer-Policy", "strict-origin-when-cross-origin")
			h.Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
			h.Set("Cache-Control", "no-store")
			w.Header().Set("X-Request-ID", chimw.GetReqID(r.Context()))
			next.ServeHTTP(w, r)
		})
	}(next)
}
