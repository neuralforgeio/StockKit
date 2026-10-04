package middleware

import (
	"context"
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/neuralforgeio/StockKit/internal/auth"
	"github.com/neuralforgeio/StockKit/internal/httpapi/httperr"
)

// GetClaims retrieves JWT claims from request context (set by AuthN middleware).
// Returns nil if claims are missing or invalid.
func GetClaims(r *http.Request) *auth.Claims {
	v := r.Context().Value(ClaimsKey)
	if v == nil {
		return nil
	}
	c, ok := v.(*auth.Claims)
	if !ok {
		return nil
	}
	return c
}

// RequireRole returns middleware that enforces the user holds at least one of the given roles.
// Roles are resolved by querying user_roles table for the authenticated user.
// "developer" role implicitly bypasses all role checks (full access for dev tools).
func RequireRole(pool *pgxpool.Pool, roles ...string) func(http.Handler) http.Handler {
	roleSet := make(map[string]struct{}, len(roles))
	for _, r := range roles {
		roleSet[r] = struct{}{}
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			claims := GetClaims(r)
			if claims == nil {
				httperr.Write(w, httperr.New("AUTH_FAILED", http.StatusUnauthorized, "Missing claims"))
				return
			}
			userRoles, err := queryUserRoles(r.Context(), pool, claims.Subject, claims.TenantID)
			if err != nil {
				httperr.Write(w, httperr.New("INTERNAL", http.StatusInternalServerError, "Failed to resolve roles"))
				return
			}
			// Developer always has full access (bypass)
			for _, ur := range userRoles {
				if ur == "developer" {
					next.ServeHTTP(w, r)
					return
				}
			}
			for _, ur := range userRoles {
				if _, ok := roleSet[ur]; ok {
					next.ServeHTTP(w, r)
					return
				}
			}
			httperr.Write(w, httperr.New("FORBIDDEN", http.StatusForbidden, "Insufficient role"))
		})
	}
}

func queryUserRoles(ctx context.Context, pool *pgxpool.Pool, userID, tenantID string) ([]string, error) {
	rows, err := pool.Query(ctx, `
		SELECT r.name
		FROM user_roles ur
		JOIN roles r ON r.id = ur.role_id AND r.tenant_id = ur.tenant_id
		WHERE ur.user_id = $1 AND ur.tenant_id = $2`,
		userID, tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]string, 0, 2)
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		out = append(out, name)
	}
	return out, rows.Err()
}
