package middleware

import (
	"context"
	"net/http"
	"strings"

	"github.com/neuralforgeio/StockKit/internal/auth"
)

type claimsKeyType string

const ClaimsKey claimsKeyType = "stockkit.claims"

func AuthN(kp *auth.KeyPair) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			token := ""
			if h := r.Header.Get("Authorization"); strings.HasPrefix(h, "Bearer ") {
				token = strings.TrimPrefix(h, "Bearer ")
			}
			if token == "" {
				if c, err := r.Cookie("access_token"); err == nil {
					token = c.Value
				}
			}
			if token == "" {
				writeAuthError(w, http.StatusUnauthorized, "Missing access token")
				return
			}

			// Signature asli: (tokenString string, kp *KeyPair)
			claims, err := auth.VerifyAccessToken(token, kp)
			if err != nil {
				writeAuthError(w, http.StatusUnauthorized, "Invalid or expired token")
				return
			}

			w.Header().Set("X-User-ID", claims.Subject)
			ctx := context.WithValue(r.Context(), ClaimsKey, claims)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func writeAuthError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_, _ = w.Write([]byte(`{"code":"AUTH_FAILED","message":"` + msg + `"}`))
}
