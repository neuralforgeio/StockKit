# 🔐 Security

## Authentication Flow

### Token Lifecycle

1. **Login** → access_token (15min) + refresh_token (7d / 30d if remember-me)
2. **API call** → Bearer access_token in `Authorization` header
3. **Expiry (401)** → client calls `/auth/refresh` to rotate
4. **Logout** → entire refresh family revoked

### EdDSA Signing

- Algorithm: EdDSA (Ed25519)
- Key pair generated at server startup (ephemeral per instance)
- Kid (key ID) embedded in JWT header for future rotation

### Refresh Token Rotation

- Each refresh creates a new family member
- **Reuse detection:** If an old refresh token is used, the entire family is revoked
- Prevents token theft from being used indefinitely

---

## Encryption

### Supplier Bank Accounts

Encrypted at rest with **AES-256-GCM**:

```go
// internal/crypto/cipher.go
type Cipher struct { key [32]byte }

func NewCipher(keyHex string) (*Cipher, error) {
    key, err := hex.DecodeString(keyHex)
    if len(key) != 32 { return nil, errors.New("key must be 32 bytes") }
    ...
}

func (c *Cipher) Encrypt(plaintext string) (string, error) {
    nonce := make([]byte, 12)
    io.ReadFull(rand.Reader, nonce)
    gcm, _ := cipher.NewGCM(block)
    ciphertext := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
    return base64.StdEncoding.EncodeToString(ciphertext), nil
}
```

- Key from `FIELD_ENCRYPTION_KEY` env var (64-char hex)
- Stored in DB as base64-encoded `nonce+ciphertext`
- Decrypted only when needed (e.g., payment processing)
- UI always shows masked value (e.g., `••••1234`)

---

## CSRF Protection

- `GET /auth/login` response sets `csrf_token` cookie (not httpOnly)
- Client reads cookie and sends as `X-CSRF-Token` header
- Middleware validates on all POST/PATCH/DELETE

---

## Log Redaction

Sensitive keys automatically redacted:

```
password, password_hash, token, access_token, refresh_token,
csrf, csrf_token, credit_card, card_number, bank_account,
secret, authorization, cookie, otp, pin
```

Example log line:
```
INFO │ [abc123] │ login successful │ user_id=0000-... password=[REDACTED]
```

---

## Rate Limiting

| Route group | Limit |
|-------------|-------|
| `/auth/*` | 10 req/min/IP |
| All authenticated | 100 req/min/user |

Returns `429 Too Many Requests` with retry headers.

---

## Production Hardening Checklist

- [ ] Change all default passwords in `.env`
- [ ] Set `FIELD_ENCRYPTION_KEY` (64-char hex)
- [ ] Enable HTTPS (reverse proxy / load balancer)
- [ ] Set `JWT_EDDSA_KEY` for persistent signing (don't regenerate on restart)
- [ ] Rotate access_token to shorter lifetime (15min)
- [ ] Enable log shipping (Loki/ELK) instead of file rotation
- [ ] Set up Redis Sentinel or Cluster for HA
- [ ] Configure PostgreSQL streaming replication
- [ ] Enable audit log immutability
- [ ] Run `go mod verify` in CI
```

---

## 6. `docs/DEPLOYMENT.md` (BARU)

```markdown
# 🚢 Deployment Guide

## Production Prerequisites

| Component | Recommended |
|-----------|-------------|
| **OS** | Ubuntu 22.04 LTS / Alpine Linux |
| **CPU** | 4+ cores |
| **RAM** | 16GB+ |
| **Storage** | 100GB+ SSD |
| **Network** | Public IP, port 80/443 |

---

## Docker Compose (Production)

### `docker-compose.prod.yml`

```yaml
version: "3.9"

services:
  postgres:
    image: postgres:18-alpine
    environment:
      POSTGRES_DB: stockkit
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    command: redis-server --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis_data:/data
    restart: unless-stopped

  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${MINIO_USER}
      MINIO_ROOT_PASSWORD: ${MINIO_PASSWORD}
    volumes:
      - minio_data:/data
    restart: unless-stopped

  backend:
    build: ./backend
    environment:
      - POSTGRES_DSN=postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/stockkit
      - REDIS_ADDR=redis:6379
      - REDIS_PASSWORD=${REDIS_PASSWORD}
      - MINIO_ENDPOINT=minio:9000
      - MINIO_ACCESS_KEY=${MINIO_USER}
      - MINIO_SECRET_KEY=${MINIO_PASSWORD}
      - FIELD_ENCRYPTION_KEY=${FIELD_ENCRYPTION_KEY}
      - API_PORT=8080
    depends_on: [postgres, redis, minio]
    restart: unless-stopped

  frontend:
    build: ./frontend
    environment:
      - NEXT_PUBLIC_API_URL=https://api.yourdomain.com
    depends_on: [backend]
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./certs:/etc/nginx/certs
    ports:
      - "80:80"
      - "443:443"
    depends_on: [frontend, backend]
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
  minio_data:
```

---

## Nginx Config

```nginx
upstream backend {
    server backend:8080;
}

upstream frontend {
    server frontend:3000;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /etc/nginx/certs/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/privkey.pem;

    # API
    location /api/ {
        proxy_pass http://backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Frontend
    location / {
        proxy_pass http://frontend;
        proxy_set_header Host $host;
    }
}

server {
    listen 80;
    return 301 https://$host$request_uri;
}
```

---

## Environment Variables

```bash
# Database
POSTGRES_USER=stockkit
POSTGRES_PASSWORD=<strong-32-char-password>
POSTGRES_DSN=postgres://stockkit:password@postgres:5432/stockkit

# Redis
REDIS_ADDR=redis:6379
REDIS_PASSWORD=<strong-24-char-password>

# MinIO
MINIO_ENDPOINT=minio:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=<strong-24-char-password>

# Encryption (64-char hex = 32 bytes)
FIELD_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef

# API
API_PORT=8080
ENV=production

# Frontend
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
```

Generate encryption key:
```bash
openssl rand -hex 32
```

---

## Deployment Steps

### 1. Prepare server

```bash
# Update system
apt update && apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh
systemctl enable docker

# Install Docker Compose
apt install docker-compose-plugin -y

# Create app directory
mkdir -p /opt/stockkit && cd /opt/stockkit
```

### 2. Clone and configure

```bash
git clone https://github.com/neuralforgeio/StockKit.git .
cp .env.example .env
nano .env  # Edit all passwords
```

### 3. Get SSL certificates

```bash
# Install certbot
apt install certbot python3-certbot-nginx -y

# Get certificate (temporary nginx config first)
certbot certonly --standalone -d yourdomain.com -d api.yourdomain.com

# Copy to project
mkdir certs
cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem certs/
cp /etc/letsencrypt/live/yourdomain.com/privkey.pem certs/
```

### 4. Deploy

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml exec backend go run ./cmd/api migrate up
docker compose -f docker-compose.prod.yml exec backend go run ./cmd/api seed
```

### 5. Auto-renew certificates

```bash
certbot renew --dry-run

# Add to crontab
(crontab -l; echo "0 0 * * * certbot renew --quiet && docker compose -f /opt/stockkit/docker-compose.prod.yml restart nginx") | crontab -
```

---

## Monitoring

### Health checks

```bash
curl https://api.yourdomain.com/api/v1/healthz
curl https://api.yourdomain.com/api/v1/readyz
```

### Logs

```bash
# Backend logs
docker compose -f docker-compose.prod.yml logs -f backend

# Application logs
tail -f /opt/stockkit/backend/logs/stockkit-$(date +%Y-%m-%d).log
```

### Metrics

- **Prometheus:** expose `/metrics` endpoint
- **Grafana:** dashboards for DB pool, heap, requests
- **Loki:** ship JSON logs for centralized search

---

## Backup Strategy

### Database (daily)

```bash
# Backup script
docker compose -f docker-compose.prod.yml exec postgres pg_dump -U stockkit stockkit > backup-$(date +%Y%m%d).sql

# Restore
cat backup-20261002.sql | docker compose -f docker-compose.prod.yml exec -T postgres psql -U stockkit stockkit
```

### MinIO (weekly)

```bash
# Use mc CLI
mc mirror minio/stockkit /backup/minio-$(date +%Y%m%d)/
```

---

## Scaling

### Horizontal (Backend)

- Multiple backend instances behind load balancer
- Stateless (JWT verified without DB lookup)
- Use shared Redis for sessions (already in place)
- Use shared MinIO for file storage

### Database Read Replicas

```yaml
postgres-replica:
  image: postgres:18-alpine
  command: postgres -c hot_standby=on
  environment:
    POSTGRES_PRIMARY: postgres:5432
```

Configure backend to route read queries to replicas.

---

## Rollback

```bash
# Rollback to previous version
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d

# Rollback migration
docker compose -f docker-compose.prod.yml exec backend go run ./cmd/api migrate down
```
```

---

## 7. Eksekusi & Verifikasi

```powershell
cd "C:\Users\Dearly Febriano\StockKit"
# File-file di atas sudah dibuat / ditimpa
git add .
git commit -m "docs: comprehensive README, API reference, architecture, frontend, security, deployment"
git push
```

**Checklist [E]:**
1. ✅ `README.md` — style HTML dengan badges, icon, Mermaid diagrams, feature overview
2. ✅ `docs/API.md` — dokumentasi **semua** endpoint dengan request/response examples
3. ✅ `docs/ARCHITECTURE.md` — arsitektur + flowchart (sales lifecycle, auth flow, approval engine)
4. ✅ `docs/FRONTEND.md` — panduan komponen, routing, patterns
5. ✅ `docs/SECURITY.md` — auth flow, encryption, CSRF, redaction
6. ✅ `docs/DEPLOYMENT.md` — production deployment end-to-end
7. ✅ Commit + push siap dilakukan

---

## 8. Catatan & Iterasi Berikutnya

Dokumentasi ini mencakup **semua fitur yang sudah dibangun** dari 79 commit Anda. Berikutnya ada 3 kandidat iterasi:

| Opsi | Deskripsi | Kompleksitas |
|------|-----------|--------------|
| **A** | **Approval decided hook** — auto-update dokumen status saat approval selesai (SO → approved, PR → approved, dll) | Medium |
| **B** | **Multi-currency conversion** — SO/PO auto-convert amount ke base currency saat create | High |
| **C** | **Goods Receipts UI polish** — UI lebih lengkap dengan detail lines, batch receive | Low |

Balas **`A`**, **`B`**, atau **`C`** (atau kombinasi) untuk iterasi berikutnya. Saya rekomendasikan **A** karena melengkapi alur approval yang sudah ada dan berdampak tinggi pada UX.
