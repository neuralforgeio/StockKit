package config

import (
	"fmt"
	"os"
	"strconv"

	"github.com/joho/godotenv"
)

type Postgres struct {
	Host     string
	Port     int
	DB       string
	User     string
	Password string
	SSLMode  string
}

// DSN renders the lib/pq and pgx compatible connection URL.
func (p Postgres) DSN() string {
	return fmt.Sprintf("postgres://%s:%s@%s:%d/%s?sslmode=%s",
		p.User, p.Password, p.Host, p.Port, p.DB, p.SSLMode)
}

type Config struct {
	Env                string
	APIPort            int
	Postgres           Postgres
	RedisAddr          string
	FieldEncryptionKey string
}

// Load reads configuration from environment variables with dev defaults.
func Load() Config {
	_ = godotenv.Load("../.env")
	_ = godotenv.Load(".env")
	return Config{
		Env:     getenv("STOCKKIT_ENV", "development"),
		APIPort: getenvInt("API_PORT", 8080),
		Postgres: Postgres{
			Host:     getenv("POSTGRES_HOST", "localhost"),
			Port:     getenvInt("POSTGRES_PORT", 5432),
			DB:       getenv("POSTGRES_DB", "stockkit"),
			User:     getenv("POSTGRES_USER", "postgres"),
			Password: getenv("POSTGRES_PASSWORD", ""),
			SSLMode:  getenv("POSTGRES_SSLMODE", "disable"),
		},
		RedisAddr:          getenv("REDIS_ADDR", "localhost:6379"),
		FieldEncryptionKey: getenv("FIELD_ENCRYPTION_KEY", ""),
	}
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getenvInt(key string, fallback int) int {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return fallback
	}
	return n
}
