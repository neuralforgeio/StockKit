package middleware

import (
	"context"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/neuralforgeio/StockKit/internal/auth"
	"github.com/neuralforgeio/StockKit/internal/httpapi/httperr"
)

// roleCacheEntry holds cached roles with a TTL.
type roleCacheEntry struct {
	roles     []string
	expiresAt time.Time
}

// roleCache is a simple in-memory TTL cache keyed by tenant|user.
type roleCache struct {
	mu      sync.RWMutex
	entries map[string]roleCacheEntry
	ttl     time.Duration
}

func newRoleCache(ttl time.Duration) *roleCache {
	return &roleCache{entries: make(map[string]roleCacheEntry), ttl: ttl}
}

func (c *roleCache) get(key string) ([]string, bool) {
	c.mu.RLock()
	e, ok := c.entries[key]
	c.mu.RUnlock()
	if !ok || time.Now().After(e.expiresAt) {
		return nil, false
	}
	return e.roles, true
}

func (c *roleCache) set(key string, roles []string) {
	c.mu.Lock()
	c.entries[key] = roleCacheEntry{roles: roles, expiresAt: time.Now().Add(c.ttl)}
	c.mu.Unlock()
}

// shared cache (5m TTL) across all RequireRole middleware instances.
var sharedRoleCache = newRoleCache(5 * time.Minute)

// GetClaims retrieves JWT claims from request context (set by AuthN).
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

// RequireRole enforces the user holds at least one of the given roles.
// "developer" implicitly bypasses all checks. Roles cached 5m per user.
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
			cacheKey := claims.TenantID + "|" + claims.Subject + "|" + strconv.Itoa(claims.PermVersion)
			userRoles, ok := sharedRoleCache.get(cacheKey)
			if !ok {
				var err error
				userRoles, err = queryUserRoles(r.Context(), pool, claims.Subject, claims.TenantID)
				if err != nil {
					httperr.Write(w, httperr.New("INTERNAL", http.StatusInternalServerError, "Failed to resolve roles"))
					return
				}
				sharedRoleCache.set(cacheKey, userRoles)
			}
			for _, ur := range userRoles {
				if ur == "developer" {
					next.ServeHTTP(w, r)
					return
				}
			}
			for _, ur := range userRoles {
				if _, hit := roleSet[ur]; hit {
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
