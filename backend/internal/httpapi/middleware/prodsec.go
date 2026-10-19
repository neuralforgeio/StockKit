package middleware

import "net/http"

// ProdSecurity adds transport-security headers when the service runs in
// production or with TLS. No-op in development so local workflow stays
// frictionless. HSTS is only safe to send over HTTPS, hence the gate.
func ProdSecurity(enabled bool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		if !enabled {
			return next
		}
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload")
			w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
			w.Header().Set("X-Content-Type-Options", "nosniff")
			w.Header().Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
			next.ServeHTTP(w, r)
		})
	}
}
