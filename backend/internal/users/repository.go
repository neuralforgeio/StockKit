package users

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/neuralforgeio/StockKit/internal/auth"
	"github.com/neuralforgeio/StockKit/internal/store/pg"
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

// ErrPasswordReused is returned when the new password verifies against the
// user's CURRENT hash. Only the active password is blocked; once replaced,
// the old password becomes usable again (per product requirement).
var ErrPasswordReused = errors.New("password must be different from the current password")

type Repository struct {
	pool *pgxpool.Pool
}

func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

/* ----------------------------- audit helper ----------------------------- */

// writeAuditTx inserts an audit_logs row inside the given transaction so every
// user-management mutation is traceable with its actor. Password hashes are
// NEVER written; only safe metadata.
func writeAuditTx(ctx context.Context, tx pgx.Tx, tenantID, actorID, eventType, entityType, entityID string, oldData, newData any) error {
	var oldJSON, newJSON []byte
	if oldData != nil {
		b, err := json.Marshal(oldData)
		if err != nil {
			return err
		}
		oldJSON = b
	}
	if newData != nil {
		b, err := json.Marshal(newData)
		if err != nil {
			return err
		}
		newJSON = b
	}
	_, err := tx.Exec(ctx, `
		INSERT INTO audit_logs (tenant_id, actor_user_id, event_type, entity_type, entity_id, old_data, new_data)
		VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		tenantID, actorID, eventType, entityType, entityID, oldJSON, newJSON)
	return err
}

// rolesSnapshotTx returns sorted role names for a user inside a transaction.
func rolesSnapshotTx(ctx context.Context, tx pgx.Tx, tenantID, userID string) ([]string, error) {
	rows, err := tx.Query(ctx, `
		SELECT r.name
		FROM user_roles ur
		JOIN roles r ON r.id = ur.role_id AND r.tenant_id = ur.tenant_id
		WHERE ur.tenant_id = $1 AND ur.user_id = $2
		ORDER BY r.name`, tenantID, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []string{}
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		out = append(out, name)
	}
	return out, rows.Err()
}

/* -------------------------------- queries ------------------------------- */

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
			if rs, ok := rolesByUser[users[i].ID]; ok {
				users[i].Roles = rs
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

// HasRole checks whether a user holds a specific role name in the tenant.
func (r *Repository) HasRole(ctx context.Context, tenantID, userID, roleName string) (bool, error) {
	var n int
	err := r.pool.QueryRow(ctx, `
		SELECT COUNT(*)
		FROM user_roles ur
		JOIN roles r ON r.id = ur.role_id AND r.tenant_id = ur.tenant_id
		WHERE ur.tenant_id = $1 AND ur.user_id = $2 AND r.name = $3`,
		tenantID, userID, roleName).Scan(&n)
	if err != nil {
		return false, err
	}
	return n > 0, nil
}

/* ------------------------------- mutations ------------------------------ */

// CreateUserInput carries hashed credential + initial roles for Create.
type CreateUserInput struct {
	Email        string
	FullName     string
	PasswordHash string
	Roles        []string
}

// Create inserts a user and grants initial roles atomically, then audits.
func (r *Repository) Create(ctx context.Context, tenantID, actorID string, input CreateUserInput) (*User, error) {
	var userID string
	err := pg.WithTx(ctx, r.pool, func(tx pgx.Tx) error {
		if err := tx.QueryRow(ctx, `
			INSERT INTO users (tenant_id, email, password_hash, full_name, status, perm_version)
			VALUES ($1, $2, $3, $4, 'active', 1)
			RETURNING id`, tenantID, input.Email, input.PasswordHash, input.FullName).Scan(&userID); err != nil {
			return fmt.Errorf("insert user: %w", err)
		}
		for _, roleName := range input.Roles {
			tag, err := tx.Exec(ctx, `
				INSERT INTO user_roles (tenant_id, user_id, role_id)
				SELECT $1, $2, r.id FROM roles r WHERE r.tenant_id = $1 AND r.name = $3
				ON CONFLICT (tenant_id, user_id, role_id) DO NOTHING`, tenantID, userID, roleName)
			if err != nil {
				return fmt.Errorf("grant role %s: %w", roleName, err)
			}
			if tag.RowsAffected() == 0 {
				return fmt.Errorf("role %q not found in tenant", roleName)
			}
		}
		return writeAuditTx(ctx, tx, tenantID, actorID, "INSERT", "users", userID,
			nil, map[string]any{
				"email":     input.Email,
				"full_name": input.FullName,
				"roles":     input.Roles,
			})
	})
	if err != nil {
		return nil, err
	}
	return r.GetByID(ctx, tenantID, userID)
}

// AssignRole grants a role and audits the role-set change.
func (r *Repository) AssignRole(ctx context.Context, tenantID, actorID, userID, roleName string) error {
	return pg.WithTx(ctx, r.pool, func(tx pgx.Tx) error {
		before, err := rolesSnapshotTx(ctx, tx, tenantID, userID)
		if err != nil {
			return err
		}
		tag, err := tx.Exec(ctx, `
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
		after, err := rolesSnapshotTx(ctx, tx, tenantID, userID)
		if err != nil {
			return err
		}
		return writeAuditTx(ctx, tx, tenantID, actorID, "UPDATE", "user_roles", userID,
			map[string]any{"roles": before}, map[string]any{"roles": after})
	})
}

// RevokeRole removes a role and audits the role-set change.
// perm_version bump happens automatically via DB trigger on user_roles.
func (r *Repository) RevokeRole(ctx context.Context, tenantID, actorID, userID, roleName string) error {
	return pg.WithTx(ctx, r.pool, func(tx pgx.Tx) error {
		before, err := rolesSnapshotTx(ctx, tx, tenantID, userID)
		if err != nil {
			return err
		}
		tag, err := tx.Exec(ctx, `
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
		after, err := rolesSnapshotTx(ctx, tx, tenantID, userID)
		if err != nil {
			return err
		}
		return writeAuditTx(ctx, tx, tenantID, actorID, "UPDATE", "user_roles", userID,
			map[string]any{"roles": before}, map[string]any{"roles": after})
	})
}

// ResetPassword sets a new password with reuse prevention: the candidate is
// verified against the current hash inside the same transaction and rejected
// if it matches. On success it bumps perm_version, revokes ALL refresh
// families/tokens, and audits (without any secret material).
func (r *Repository) ResetPassword(ctx context.Context, tenantID, actorID, userID, newPassword string) error {
	return pg.WithTx(ctx, r.pool, func(tx pgx.Tx) error {
		var currentHash string
		err := tx.QueryRow(ctx, `
			SELECT password_hash FROM users
			WHERE id = $1 AND tenant_id = $2 FOR UPDATE`, userID, tenantID).Scan(&currentHash)
		if errors.Is(err, pgx.ErrNoRows) {
			return fmt.Errorf("user not found")
		}
		if err != nil {
			return fmt.Errorf("lock user: %w", err)
		}

		if ok, verr := auth.VerifyPassword(newPassword, currentHash); verr == nil && ok {
			return ErrPasswordReused
		}

		hash, err := auth.HashPassword(newPassword)
		if err != nil {
			return fmt.Errorf("hash password: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			UPDATE users
			SET password_hash = $1, perm_version = perm_version + 1, updated_at = now()
			WHERE id = $2 AND tenant_id = $3`, hash, userID, tenantID); err != nil {
			return fmt.Errorf("update password: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			UPDATE refresh_families SET revoked_at = now()
			WHERE user_id = $1 AND revoked_at IS NULL`, userID); err != nil {
			return fmt.Errorf("revoke refresh families: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			UPDATE refresh_tokens SET status = 'revoked'
			WHERE status <> 'revoked'
			  AND family_id IN (SELECT id FROM refresh_families WHERE user_id = $1)`, userID); err != nil {
			return fmt.Errorf("revoke refresh tokens: %w", err)
		}
		return writeAuditTx(ctx, tx, tenantID, actorID, "UPDATE", "users", userID,
			nil, map[string]any{"password_reset": true})
	})
}

// SetStatus activates/deactivates a user. Deactivating bumps perm_version and
// revokes all sessions. The change is audited.
func (r *Repository) SetStatus(ctx context.Context, tenantID, actorID, userID, status string) error {
	if status != "active" && status != "inactive" {
		return fmt.Errorf("invalid status %q (expected active|inactive)", status)
	}
	return pg.WithTx(ctx, r.pool, func(tx pgx.Tx) error {
		var current string
		err := tx.QueryRow(ctx, `
			SELECT status FROM users WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
			userID, tenantID).Scan(&current)
		if errors.Is(err, pgx.ErrNoRows) {
			return fmt.Errorf("user not found")
		}
		if err != nil {
			return fmt.Errorf("lock user: %w", err)
		}
		if current == status {
			return nil
		}
		if _, err := tx.Exec(ctx, `
			UPDATE users
			SET status = $1, perm_version = perm_version + 1, updated_at = now()
			WHERE id = $2 AND tenant_id = $3`, status, userID, tenantID); err != nil {
			return fmt.Errorf("update status: %w", err)
		}
		if status == "inactive" {
			if _, err := tx.Exec(ctx, `
				UPDATE refresh_families SET revoked_at = now()
				WHERE user_id = $1 AND revoked_at IS NULL`, userID); err != nil {
				return fmt.Errorf("revoke refresh families: %w", err)
			}
			if _, err := tx.Exec(ctx, `
				UPDATE refresh_tokens SET status = 'revoked'
				WHERE status <> 'revoked'
				  AND family_id IN (SELECT id FROM refresh_families WHERE user_id = $1)`, userID); err != nil {
				return fmt.Errorf("revoke refresh tokens: %w", err)
			}
		}
		return writeAuditTx(ctx, tx, tenantID, actorID, "UPDATE", "users", userID,
			map[string]any{"status": current}, map[string]any{"status": status})
	})
}
