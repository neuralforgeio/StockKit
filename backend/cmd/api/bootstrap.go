package main

import (
	"bufio"
	"context"
	"errors"
	"flag"
	"fmt"
	"os"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/term"

	"github.com/neuralforgeio/StockKit/internal/auth"
	"github.com/neuralforgeio/StockKit/internal/config"
	"github.com/neuralforgeio/StockKit/internal/store/pg"
)

// bootstrapUserCmd creates or resets a privileged user interactively.
//
// SECURITY CONTRACT: credentials are NEVER accepted via CLI flags, env vars,
// or files. They are read from the controlling terminal (password hidden) or,
// in non-TTY mode (CI pipelines), from stdin pipe only. Nothing secret is
// logged or printed.
func bootstrapUserCmd(args []string) error {
	fs := flag.NewFlagSet("bootstrap-user", flag.ExitOnError)
	role := fs.String("role", "owner", "role name to grant (owner, admin, developer, ...)")
	tenantID := fs.String("tenant-id", "00000000-0000-0000-0000-000000000001", "target tenant id")
	resetPassword := fs.Bool("reset-password", false, "allow resetting the password of an existing user")
	if err := fs.Parse(args); err != nil {
		return err
	}

	ctx := context.Background()
	cfg := config.Load()
	pool, err := pgxpool.New(ctx, cfg.Postgres.DSN())
	if err != nil {
		return err
	}
	defer pool.Close()

	isTTY := term.IsTerminal(int(os.Stdin.Fd()))
	pipeReader := bufio.NewReader(os.Stdin)

	// readLine: visible input (email, name). TTY reads byte-by-byte to avoid
	// buffering ahead of the hidden password read.
	readLine := func(prompt string) (string, error) {
		if !isTTY {
			line, err := pipeReader.ReadString('\n')
			if err != nil {
				return "", err
			}
			return strings.TrimSpace(line), nil
		}
		fmt.Print(prompt)
		var sb strings.Builder
		one := make([]byte, 1)
		for {
			n, rerr := os.Stdin.Read(one)
			if n > 0 {
				if one[0] == '\n' {
					break
				}
				if one[0] != '\r' {
					sb.WriteByte(one[0])
				}
			}
			if rerr != nil {
				return sb.String(), rerr
			}
		}
		fmt.Println()
		return strings.TrimSpace(sb.String()), nil
	}

	// readSecret: hidden input on TTY; plain line on pipe (CI).
	readSecret := func(prompt string) (string, error) {
		if !isTTY {
			line, err := pipeReader.ReadString('\n')
			if err != nil {
				return "", err
			}
			return strings.TrimRight(line, "\r\n"), nil
		}
		fmt.Print(prompt)
		b, err := term.ReadPassword(int(os.Stdin.Fd()))
		fmt.Println()
		if err != nil {
			return "", err
		}
		return string(b), nil
	}

	email, err := readLine("Email: ")
	if err != nil || email == "" || !strings.Contains(email, "@") {
		return fmt.Errorf("valid email is required")
	}
	fullName, err := readLine("Full name: ")
	if err != nil || fullName == "" {
		return fmt.Errorf("full name is required")
	}
	password, err := readSecret("Password (min 8 chars, hidden): ")
	if err != nil {
		return err
	}
	if len(password) < 8 {
		return fmt.Errorf("password must be at least 8 characters")
	}
	confirm, err := readSecret("Confirm password: ")
	if err != nil {
		return err
	}
	if password != confirm {
		return fmt.Errorf("passwords do not match")
	}

	hash, err := auth.HashPassword(password)
	if err != nil {
		return fmt.Errorf("hash password: %w", err)
	}

	var userID string
	err = pg.WithTx(ctx, pool, func(tx pgx.Tx) error {
		var tn string
		if err := tx.QueryRow(ctx, `SELECT id FROM tenants WHERE id = $1`, *tenantID).Scan(&tn); err != nil {
			return fmt.Errorf("tenant %s not found (run migrate + seed first)", *tenantID)
		}
		var roleID string
		if err := tx.QueryRow(ctx, `SELECT id FROM roles WHERE tenant_id = $1 AND name = $2`, *tenantID, *role).Scan(&roleID); err != nil {
			return fmt.Errorf("role %q not found in tenant (check roles table)", *role)
		}

		var existing string
		err := tx.QueryRow(ctx, `SELECT id FROM users WHERE email = $1`, email).Scan(&existing)
		switch {
		case err == nil:
			if !*resetPassword {
				return fmt.Errorf("user %s already exists (re-run with --reset-password to change password)", email)
			}
			if err := tx.QueryRow(ctx, `
				UPDATE users
				SET password_hash = $1, status = 'active', perm_version = perm_version + 1
				WHERE id = $2 RETURNING id`, hash, existing).Scan(&userID); err != nil {
				return fmt.Errorf("reset password: %w", err)
			}
		case errors.Is(err, pgx.ErrNoRows):
			if err := tx.QueryRow(ctx, `
				INSERT INTO users (tenant_id, email, password_hash, full_name, status, perm_version)
				VALUES ($1, $2, $3, $4, 'active', 1)
				RETURNING id`, *tenantID, email, hash, fullName).Scan(&userID); err != nil {
				return fmt.Errorf("insert user: %w", err)
			}
		default:
			return err
		}

		if _, err := tx.Exec(ctx, `
			INSERT INTO user_roles (tenant_id, user_id, role_id)
			VALUES ($1, $2, $3)
			ON CONFLICT (tenant_id, user_id, role_id) DO NOTHING`,
			*tenantID, userID, roleID); err != nil {
			return fmt.Errorf("grant role: %w", err)
		}
		return nil
	})
	if err != nil {
		return err
	}

	fmt.Printf("\n✓ User ready : %s (id %s)\n", email, userID)
	fmt.Printf("✓ Role granted: %s (tenant %s)\n", *role, *tenantID)
	fmt.Println("✓ Password hashed server-side; never written to env, files, args, or logs.")
	return nil
}
