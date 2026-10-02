package auth

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// Claims represents the JWT payload per PRD FR-AUTH-08.
type Claims struct {
	jwt.RegisteredClaims
	TenantID    string `json:"tid"`
	PermVersion int    `json:"perm_version"`
	Fingerprint string `json:"fpg"`
}

// KeyPair holds the active signing key and verification keys.
type KeyPair struct {
	KID        string
	PrivateKey ed25519.PrivateKey
	PublicKey  ed25519.PublicKey
}

// GenerateKeyPair creates a new EdDSA keypair for JWT signing.
func GenerateKeyPair() (*KeyPair, error) {
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		return nil, err
	}
	kidBytes := sha256.Sum256(pub)
	kid := base64.RawURLEncoding.EncodeToString(kidBytes[:8])
	return &KeyPair{
		KID:        kid,
		PrivateKey: priv,
		PublicKey:  pub,
	}, nil
}

// SignAccessToken creates a signed JWT (15m TTL).
func SignAccessToken(kp *KeyPair, userID, tenantID string, permVersion int, fpg string) (string, string, error) {
	jtiBytes := make([]byte, 16)
	if _, err := rand.Read(jtiBytes); err != nil {
		return "", "", err
	}
	jti := base64.RawURLEncoding.EncodeToString(jtiBytes)

	now := time.Now()
	claims := Claims{
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    "stockkit",
			Subject:   userID,
			ID:        jti,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(15 * time.Minute)),
		},
		TenantID:    tenantID,
		PermVersion: permVersion,
		Fingerprint: fpg,
	}
	token := jwt.NewWithClaims(jwt.SigningMethodEdDSA, claims)
	token.Header["kid"] = kp.KID

	signed, err := token.SignedString(kp.PrivateKey)
	return signed, jti, err
}

// VerifyAccessToken validates the JWT signature and expiration.
func VerifyAccessToken(tokenStr string, kp *KeyPair) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &Claims{}, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodEd25519); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return kp.PublicKey, nil
	})
	if err != nil {
		return nil, err
	}
	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, errors.New("invalid token")
	}
	return claims, nil
}
