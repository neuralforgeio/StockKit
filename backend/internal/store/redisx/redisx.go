package redisx

import "github.com/redis/go-redis/v9"

// New builds the Redis client used for cache, rate limiting, and jti revocation.
func New(addr string) *redis.Client {
	return redis.NewClient(&redis.Options{Addr: addr})
}
