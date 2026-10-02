package middleware

import (
	"crypto/subtle"
	"net/http"
)

func csrfExempt(path string) bool {
	switch path {
	case "/api/v1/auth/login", "/api/v1/auth/refresh":
		return true
	default:
		return false
	}
}

// CSRF enforces the double-submit cookie pattern for every mutation (FR-AUTH-18).
func CSRF(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPost, http.MethodPatch, http.MethodPut, http.MethodDelete:
		default:
			next.ServeHTTP(w, r)
			return
		}
		if csrfExempt(r.URL.Path) {
			next.ServeHTTP(w, r)
			return
		}
		cookie, err := r.Cookie("csrf")
		header := r.Header.Get("X-CSRF-Token")
		if err != nil || cookie.Value == "" || header == "" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusForbidden)
			_, _ = w.Write([]byte(`{"error":{"code":"CSRF_INVALID","message":"CSRF token missing"}}`))
			return
		}
		// subtle.ConstantTimeCompare returns 1 if equal, 0 if different
		if subtle.ConstantTimeCompare([]byte(cookie.Value), []byte(header)) != 1 {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusForbidden)
			_, _ = w.Write([]byte(`{"error":{"code":"CSRF_INVALID","message":"CSRF token mismatch"}}`))
			return
		}
		next.ServeHTTP(w, r)
	})
}
