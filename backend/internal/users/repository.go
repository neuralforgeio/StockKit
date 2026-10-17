package users

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type User struct {
	ID          string    `json:"id"`
	TenantID    string    `json:"tenant_id"`
	Email       string    `json:"email"`
	FullName    string    `json:"full_name"`
	Status      string    `json:"status"`
	PermVersion int       `json:"perm_version"`
	Roles       []string  `json:"roles"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type Role struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
}

type Repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

// List returns all users with their roles for a tenant.
func (r *Repository) List(ctx context.Context, tenantID string) ([]User, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT u.id, u.tenant_id, u.email, u.full_name, u.status, u.perm_version,
		       u.created_at, u.updated_at
		FROM users u
		WHERE u.tenant_id = $1
		ORDER BY u.created_at DESC`, tenantID)
	if err != nil {
		return nil, fmt.Errorf("list users: %w", err)
	}
	defer rows.Close()

	users := []User{}
	for rows.Next() {
		var u User
		if err := rows.Scan(&u.ID, &u.TenantID, &u.Email, &u.FullName, &u.Status,
			&u.PermVersion, &u.CreatedAt, &u.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan user: %w", err)
		}
		u.Roles = []string{}
		users = append(users, u)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// Batch-fetch roles untuk semua users (efisien)
	if len(users) > 0 {
		userIDs := make([]string, len(users))
		for i, u := range users {
			userIDs[i] = u.ID
		}
		roleRows, err := r.pool.Query(ctx, `
			SELECT ur.user_id, r.name
			FROM user_roles ur
			JOIN roles r ON r.id = ur.role_id AND r.tenant_id = ur.tenant_id
			WHERE ur.tenant_id = $1 AND ur.user_id = ANY($2)`, tenantID, userIDs)
		if err != nil {
			return nil, fmt.Errorf("list user roles: %w", err)
		}
		defer roleRows.Close()

		rolesByUser := make(map[string][]string)
		for roleRows.Next() {
			var userID, roleName string
			if err := roleRows.Scan(&userID, &roleName); err != nil {
				return nil, err
			}
			rolesByUser[userID] = append(rolesByUser[userID], roleName)
		}
		for i := range users {
			if roles, ok := rolesByUser[users[i].ID]; ok {
				users[i].Roles = roles
			}
		}
	}
	return users, nil
}

// GetByID returns a single user with roles.
func (r *Repository) GetByID(ctx context.Context, tenantID, userID string) (*User, error) {
	var u User
	err := r.pool.QueryRow(ctx, `
		SELECT u.id, u.tenant_id, u.email, u.full_name, u.status, u.perm_version,
		       u.created_at, u.updated_at
		FROM users u
		WHERE u.id = $1 AND u.tenant_id = $2`, userID, tenantID).
		Scan(&u.ID, &u.TenantID, &u.Email, &u.FullName, &u.Status, &u.PermVersion,
			&u.CreatedAt, &u.UpdatedAt)
	if err == pgx.ErrNoRows {
		return nil, fmt.Errorf("user not found")
	}
	if err != nil {
		return nil, err
	}
	u.Roles = []string{}

	rows, err := r.pool.Query(ctx, `
		SELECT r.name
		FROM user_roles ur
		JOIN roles r ON r.id = ur.role_id AND r.tenant_id = ur.tenant_id
		WHERE ur.user_id = $1 AND ur.tenant_id = $2`, userID, tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var roleName string
		if err := rows.Scan(&roleName); err != nil {
			return nil, err
		}
		u.Roles = append(u.Roles, roleName)
	}
	return &u, nil
}

// ListRoles returns all roles for a tenant.
func (r *Repository) ListRoles(ctx context.Context, tenantID string) ([]Role, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, name, description FROM roles
		WHERE tenant_id = $1
		ORDER BY name`, tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Role{}
	for rows.Next() {
		var ro Role
		if err := rows.Scan(&ro.ID, &ro.Name, &ro.Description); err != nil {
			return nil, err
		}
		out = append(out, ro)
	}
	return out, rows.Err()
}

// AssignRole grants a role to a user and bumps perm_version so existing sessions
// invalidate on next request (perm_version trigger fires automatically).
func (r *Repository) AssignRole(ctx context.Context, tenantID, userID, roleName string) error {
	tag, err := r.pool.Exec(ctx, `
		INSERT INTO user_roles (tenant_id, user_id, role_id)
		SELECT $1, $2, r.id FROM roles r
		WHERE r.tenant_id = $1 AND r.name = $3
		ON CONFLICT (tenant_id, user_id, role_id) DO NOTHING`, tenantID, userID, roleName)
	if err != nil {
		return fmt.Errorf("assign role: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("role %q not found or already assigned", roleName)
	}
	return nil
}

// RevokeRole removes a role from a user. perm_version is bumped automatically
// by the DB trigger on user_roles change.
func (r *Repository) RevokeRole(ctx context.Context, tenantID, userID, roleName string) error {
	tag, err := r.pool.Exec(ctx, `
		DELETE FROM user_roles ur
		USING roles r
		WHERE ur.role_id = r.id AND ur.tenant_id = r.tenant_id
		  AND ur.user_id = $2 AND ur.tenant_id = $1 AND r.name = $3`, tenantID, userID, roleName)
	if err != nil {
		return fmt.Errorf("revoke role: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("role %q not assigned to user", roleName)
	}
	return nil
}
