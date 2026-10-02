package fieldcipher

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"strings"
)

const tokenPrefix = "v1:"

type Cipher struct {
	gcm cipher.AEAD
}

// New builds an AES-256-GCM cipher from a base64-encoded 32-byte key.
func New(base64Key string) (*Cipher, error) {
	key, err := base64.StdEncoding.DecodeString(base64Key)
	if err != nil {
		return nil, fmt.Errorf("decode field encryption key: %w", err)
	}
	if len(key) != 32 {
		return nil, errors.New("field encryption key must decode to 32 bytes")
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("create aes cipher: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("create gcm: %w", err)
	}
	return &Cipher{gcm: gcm}, nil
}

// Encrypt seals plaintext and returns a versioned base64 token for storage.
func (c *Cipher) Encrypt(plaintext string) (string, error) {
	nonce := make([]byte, c.gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", fmt.Errorf("generate nonce: %w", err)
	}
	sealed := c.gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return tokenPrefix + base64.StdEncoding.EncodeToString(sealed), nil
}

// Decrypt opens a token produced by Encrypt.
func (c *Cipher) Decrypt(token string) (string, error) {
	if !strings.HasPrefix(token, tokenPrefix) {
		return "", errors.New("unsupported cipher token version")
	}
	raw, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(token, tokenPrefix))
	if err != nil {
		return "", fmt.Errorf("decode cipher token: %w", err)
	}
	nonceSize := c.gcm.NonceSize()
	if len(raw) < nonceSize {
		return "", errors.New("cipher token too short")
	}
	plain, err := c.gcm.Open(nil, raw[:nonceSize], raw[nonceSize:], nil)
	if err != nil {
		return "", fmt.Errorf("open cipher token: %w", err)
	}
	return string(plain), nil
}

// Mask reveals only the last four characters for safe UI display.
func Mask(plaintext string) string {
	if len(plaintext) <= 4 {
		return "****"
	}
	return "****" + plaintext[len(plaintext)-4:]
}
