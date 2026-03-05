# Gravity Claw — Deployment Guide

This guide covers deploying Gravity Claw across different environments: local development, VPS (Ubuntu/Debian), and Docker-based production setups.

**Table of Contents:**
1. [Local Development Setup](#1-local-development-setup)
2. [VPS Deployment (Ubuntu/Debian)](#2-vps-deployment-ubuntudebian)
3. [Docker Deployment](#3-docker-deployment)
4. [Environment Variables](#4-environment-variables)
5. [SSL/TLS Setup](#5-ssltls-setup)
6. [Reverse Proxy Configuration](#6-reverse-proxy-configuration)
7. [Process Manager Setup](#7-process-manager-setup)
8. [Database Management](#8-database-management)
9. [Monitoring & Logging](#9-monitoring--logging)
10. [Backup & Restore](#10-backup--restore)
11. [Scaling Considerations](#11-scaling-considerations)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Local Development Setup

### Prerequisites

- **Node.js** 20+ (LTS recommended)
- **npm** 10+ (comes with Node.js)
- **git** for version control
- **make** and **g++** (for native module compilation)
- **curl** (for health checks)

### macOS Setup

```bash
# Using Homebrew
brew install node@20 npm git

# Verify installation
node --version  # v20.x.x
npm --version   # 10.x.x
```

### Ubuntu/Debian Setup

```bash
# Using NodeSource repository for Node 20
curl -sL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git build-essential python3

# Verify installation
node --version  # v20.x.x
npm --version   # 10.x.x
```

### Windows Setup

1. Download Node.js 20+ from [nodejs.org](https://nodejs.org)
2. Install with default options
3. Install Git from [git-scm.com](https://git-scm.com)
4. Use PowerShell or Git Bash for terminal commands

### Project Setup

```bash
# Clone the repository
git clone https://github.com/noorulahamed/gravityclaw.git
cd gravyclaw

# Install dependencies
npm install

# Copy environment template and configure
cp .env.example .env
# Edit .env with your API keys and settings

# Type check the project
npm run typecheck

# Verify setup with doctor command
npm run cli -- doctor
```

### Development Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start with hot reload (tsx watch) — auto-restarts on file changes |
| `npm start` | Start production server (one-time execution) |
| `npm run cli -- chat` | Interactive REPL for testing agent |
| `npm run cli -- doctor` | Run diagnostics and health checks |
| `npm run test` | Run tests in watch mode |
| `npm run test:run` | Run all tests once |
| `npm run typecheck` | TypeScript validation without emitting |

### Hot Reload Workflow

The `npm run dev` command uses `tsx watch` for instant feedback during development:

```bash
# Terminal 1: Start the agent in watch mode
npm run dev

# Terminal 2: Test in another window
npm run cli -- chat

# Edit a file in src/ → agent auto-restarts
# Tests also re-run automatically when applicable files change
```

**Tips:**
- Keep logs window open to see real-time debug output
- Set `LOG_LEVEL=debug` in `.env` for verbose output
- Use `npm run test` to run tests alongside development
- Check [docs/CLI.md](CLI.md) for more CLI commands

---

## 2. VPS Deployment (Ubuntu/Debian)

### System Requirements

**Minimum:**
- 2GB RAM (1GB for Node + 1GB buffer for peak loads)
- 30GB storage (SQLite DB, logs, memory files)
- 1 vCPU (adequate for single agent instance)

**Recommended:**
- 4GB+ RAM
- 50GB+ SSD storage
- 2+ vCPUs for higher throughput
- Ubuntu 22.04 LTS or Debian 12

### Pre-flight Checklist

```bash
# Check system resources
free -h                    # Available memory
df -h /                    # Disk space
nproc                      # CPU cores
uname -r                   # Kernel version

# Update system
sudo apt-get update && sudo apt-get upgrade -y
```

### Install Node.js and Dependencies

```bash
# Add Node.js 20 repository
curl -sL https://deb.nodesource.com/setup_20.x | sudo -E bash -

# Install packages
sudo apt-get install -y \
    nodejs \
    git \
    build-essential \
    python3 \
    curl \
    wget \
    htop \
    screen

# Verify versions
node --version
npm --version
```

### Create Application User

```bash
# Create dedicated non-root user
sudo useradd -m -s /bin/bash -d /home/gravyclaw gravyclaw

# Create app directory with proper ownership
sudo mkdir -p /opt/gravyclaw
sudo chown -R gravyclaw:gravyclaw /opt/gravyclaw

# Restrict directory permissions
sudo chmod 750 /opt/gravyclaw
```

### Clone and Setup Application

```bash
# Switch to app user
sudo su - gravyclaw

# Clone repository
git clone https://github.com/noorulahamed/gravityclaw.git /opt/gravyclaw
cd /opt/gravyclaw

# Install dependencies as gravyclaw user
npm install --production

# Type check
npm run typecheck
```

### Environment Configuration

```bash
# Create .env file
nano /opt/gravyclaw/.env

# Paste your configuration (see Section 4 for full reference)
# Save with Ctrl+O, Enter, Ctrl+X
```

**Minimum .env for VPS:**
```bash
# Telegram
TELEGRAM_BOT_TOKEN=your_token_here
TELEGRAM_ALLOWED_USER_ID=your_user_id

# LLM Provider
LLM_PROVIDER=openrouter
OPENROUTER_API_KEY=your_api_key

# Port
PORT=3000

# Logging
LOG_LEVEL=info

# Enable structured logging for log aggregation
NODE_ENV=production
```

### Database Initialization

```bash
# Run from app directory
cd /opt/gravyclaw

# Initialize database (automatic on first run)
npm start

# Verify database was created
ls -lah gravity.db

# Check database integrity
sqlite3 gravity.db "PRAGMA integrity_check;"

# Exit app with Ctrl+C
```

### Verify Deployment

```bash
# Test with CLI
npm run cli -- doctor

# Output should show:
# ✓ Configuration valid
# ✓ Database connected
# ✓ Telegram credentials loaded
# etc.
```

---

## 3. Docker Deployment

### Docker Prerequisites

```bash
# Install Docker (Ubuntu/Debian)
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add user to docker group (optional, requires logout/login)
sudo usermod -aG docker $USER

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Verify installation
docker --version
docker-compose --version
```

### Using the Provided Dockerfile

The [Dockerfile](../Dockerfile) is pre-configured for production use:

```dockerfile
FROM node:20-slim

# Install system dependencies for better-sqlite3 and playwright
RUN apt-get update && apt-get install -y \
    python3 make g++ curl \
    [browser dependencies for playwright]

WORKDIR /app
COPY package*.json ./
RUN npm install
RUN npx playwright install --with-deps chromium

COPY . .
ENV NODE_ENV=production
EXPOSE 3000
```

### Build and Run Single Container

```bash
# Build the image
docker build -t gravyclaw:latest .

# Run with named volume for persistence
docker run -d \
    --name gravyclaw \
    --restart always \
    -p 3000:3000 \
    -e TELEGRAM_BOT_TOKEN=your_token \
    -e TELEGRAM_ALLOWED_USER_ID=your_id \
    -e LLM_PROVIDER=openrouter \
    -e OPENROUTER_API_KEY=your_key \
    -v gravyclaw-db:/app/gravity.db \
    -v gravyclaw-logs:/app/logs \
    gravyclaw:latest

# Check container status
docker ps
docker logs gravyclaw -f  # Follow logs

# Stop container
docker stop gravyclaw
docker rm gravyclaw
```

### Production Setup with Docker Compose

Use the provided [docker-compose.yml](../docker-compose.yml):

```yaml
version: '3.8'

services:
  gravyclaw:
    build: .
    container_name: gravyclaw
    restart: always
    volumes:
      - ./.env:/app/.env          # Environment variables
      - ./gravity.db:/app/gravity.db      # Database (persisted)
      - ./secrets.enc.json:/app/secrets.enc.json  # Encrypted secrets
      - ./memory-files:/app/memory-files  # Memory cache
      - ./logs:/app/logs          # Application logs
      - ./baileys_auth_info:/app/baileys_auth_info  # WhatsApp session
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    logging:
      driver: "json-file"
      options:
        max-size: "10m"         # Rotate logs at 10MB
        max-file: "3"           # Keep 3 rotated files (30MB total)
```

### Deploy with Docker Compose

```bash
# Navigate to project directory
cd /opt/gravyclaw

# Create necessary directories
mkdir -p {logs,memory-files,baileys_auth_info}

# Create .env file
cp .env.example .env
# Edit .env with your keys

# Start services
docker-compose up -d

# View logs
docker-compose logs -f gravyclaw

# Stop services
docker-compose down

# Stop and remove volumes (careful!)
docker-compose down -v
```

### Volume Mapping Details

| Host Path | Container Path | Purpose |
|-----------|----------------|---------|
| `./.env` | `/app/.env` | Environment configuration |
| `./gravity.db` | `/app/gravity.db` | SQLite database (persistent) |
| `./secrets.enc.json` | `/app/secrets.enc.json` | Encrypted API keys |
| `./memory-files` | `/app/memory-files` | Knowledge graph & fact files |
| `./logs` | `/app/logs` | Application logs |
| `./baileys_auth_info` | `/app/baileys_auth_info` | WhatsApp socket session data |

### Environment Variable Handling

Pass `.env` file to Docker container:

```bash
# Option 1: Use .env file volume (recommended)
docker run -v $(pwd)/.env:/app/.env gravyclaw:latest

# Option 2: Pass individual variables
docker run -e TELEGRAM_BOT_TOKEN=xxx gravyclaw:latest

# Environment in docker-compose
# Both approaches work; .env file is cleaner for many variables
```

### Port Configuration

The default port is **3000**. Change if needed:

```yaml
# docker-compose.yml
ports:
  - "8080:3000"  # Maps host port 8080 to container port 3000

# Or add to .env
PORT=3000
```

Then access via `http://localhost:8080` from the host.

### Monitoring Container Health

```bash
# Check container status
docker-compose ps

# View resource usage
docker stats gravyclaw

# Inspect logs
docker-compose logs --tail=100 gravyclaw

# Enter container shell (debugging)
docker-compose exec gravyclaw bash
```

---

## 4. Environment Variables

### Complete Configuration Reference

Create a `.env` file at the project root with the following variables:

#### Required: Telegram Integration

```bash
# Get token from @BotFather on Telegram
TELEGRAM_BOT_TOKEN=123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11

# Get your user ID from @userinfobot on Telegram
TELEGRAM_ALLOWED_USER_ID=987654321
```

#### Required: LLM Provider Configuration

```bash
# Choose provider: openrouter | openai | anthropic | google | groq | deepseek | ollama | failover
LLM_PROVIDER=openrouter

# Model name (check provider docs for available models)
LLM_MODEL=openrouter/free

# For failover mode: comma-separated list of providers
LLM_FAILOVER_LIST=openai,anthropic,openrouter
```

#### API Keys (choose based on LLM_PROVIDER)

```bash
# OpenRouter (free tier available)
OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxx

# OpenAI
OPENAI_API_KEY=sk-proj-xxxxxxxxxx

# Anthropic
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxx

# Google
GOOGLE_API_KEY=xxxxxxxxxx

# Groq
GROQ_API_KEY=xxxxxxxxxx

# DeepSeek
DEEPSEEK_API_KEY=sk-xxxxxxxxxx

# For embeddings (optional)
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
```

#### Optional: Cloud Storage & Vector DB

```bash
# Supabase (for cloud memory sync)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### Optional: Voice Features

```bash
# ElevenLabs (text-to-speech)
ELEVENLABS_API_KEY=sk_xxxxxxxxxxxxxxxx
ELEVENLABS_VOICE_ID=bella  # Options: bella, eric, essie, isabella, james, jessica, josh, etc.
```

#### Optional: Wake Word (Local Only)

```bash
# Enable wake word detection (requires microphone, desktop only)
WAKE_WORD_ENABLED=false
WAKE_WORD_PHRASE=hey claw
WAKE_WORD_THRESHOLD=0.75  # Confidence 0-1
```

#### Optional: Search

```bash
# Search provider: duckduckgo | serpapi | brave
SEARCH_PROVIDER=duckduckgo

# SerpAPI (requires API key)
SERPAPI_API_KEY=xxxxxxxxxx

# Brave Search
BRAVE_SEARCH_KEY=xxxxxxxxxx

# Cache duration for search results
SEARCH_CACHE_TTL_MINUTES=60
```

#### Optional: WhatsApp Messaging

```bash
# Enable WhatsApp integration
WHATSAPP_ENABLED=false
```

#### Optional: Local Ollama (for air-gapped mode)

```bash
# Ollama local API endpoint
OLLAMA_BASE_URL=http://localhost:11434

# Enable air-gapped mode (no external API calls)
AIR_GAPPED=false
```

#### Application Settings

```bash
# Server port
PORT=3000

# Log level: debug | info | warn | error
LOG_LEVEL=info

# Node environment
NODE_ENV=production

# Max iterations per agent run (safety limit)
AGENT_MAX_ITERATIONS=10

# Webhook base URL (for incoming webhooks)
WEBHOOK_BASE_URL=https://yourdomain.com

# Path allowlist for file operations (comma-separated)
PATH_ALLOWLIST=/home/user/docs,/tmp

# Master encryption key for secrets.enc.json (generate with scripts/encrypt-secret.ts)
MASTER_KEY=your_64_char_hex_key_or_any_string
```

#### Optional: Proactive Behaviors

```bash
# Hour for daily evening recap (0-23)
RECAP_HOUR_LOCAL=20

# Cron schedule for daily recommendations
RECOMMENDATIONS_DAILY_CRON=0 9 * * *
```

### Security Considerations

**🔒 Important Security Practices:**

1. **Never commit `.env` to git** — Use `.env.example` as template instead:
   ```bash
   echo ".env" >> .gitignore
   cp .env.example .env
   git add .env.example
   ```

2. **Protect MASTER_KEY** — Generate a strong key:
   ```bash
   node scripts/encrypt-secret.ts --generate-key
   # Copy output and set MASTER_KEY=xxx in .env
   ```

3. **Rotate API Keys regularly** — Set calendar reminders
   - OpenRouter, OpenAI, Anthropic, Google, etc.
   - Telegram bot tokens (via @BotFather)

4. **Use Separate Keys for Environments:**
   ```bash
   # .env.production
   OPENAI_API_KEY=prod-key-xxx
   
   # .env.staging
   OPENAI_API_KEY=staging-key-xxx
   ```

5. **Limit Telegram User IDs** — Only authorized users
   ```bash
   TELEGRAM_ALLOWED_USER_ID=123456789  # Your user ID only
   ```

6. **Path Allowlist for File Operations:**
   ```bash
   PATH_ALLOWLIST=/home/user/documents,/tmp/uploads
   # Empty = no file operations allowed
   ```

7. **Secrets File Encryption:**
   ```bash
   # Encrypt sensitive data
   node scripts/encrypt-secret.ts
   # Creates secrets.enc.json with encrypted values
   ```

### Example .env File

```bash
# Gravity Claw Environment Configuration
# Copy this from .env.example and fill in your values

# ============ REQUIRED ============
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_ALLOWED_USER_ID=your_user_id_here
LLM_PROVIDER=openrouter
OPENROUTER_API_KEY=your_api_key_here

# ============ RECOMMENDED ============
PORT=3000
LOG_LEVEL=info
NODE_ENV=production
AGENT_MAX_ITERATIONS=10

# ============ OPTIONAL ============
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GOOGLE_API_KEY=
GROQ_API_KEY=
DEEPSEEK_API_KEY=
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=bella
SUPABASE_URL=
SUPABASE_KEY=
SEARCH_PROVIDER=duckduckgo
WHATSAPP_ENABLED=false
AIR_GAPPED=false
MASTER_KEY=
WEBHOOK_BASE_URL=
PATH_ALLOWLIST=
RECAP_HOUR_LOCAL=20
RECOMMENDATIONS_DAILY_CRON=0 9 * * *
```

---

## 5. SSL/TLS Setup

### Let's Encrypt & Certbot (Ubuntu/Debian)

Install Certbot for automated certificate management:

```bash
# Install Certbot
sudo apt-get install -y certbot python3-certbot-nginx

# Or for Caddy/standalone
sudo apt-get install -y certbot

# Verify Certbot version
certbot --version
```

### Obtain Initial Certificate

```bash
# Standalone mode (requires port 80 to be accessible)
sudo certbot certonly --standalone \
    -d yourdomain.com \
    -d api.yourdomain.com \
    -d www.yourdomain.com

# Interactive prompts:
# - Email for renewal notifications
# - Agree to terms
# - Share email with EFF (optional)

# Certificates saved to:
# /etc/letsencrypt/live/yourdomain.com/{cert.pem,privkey.pem,chain.pem,fullchain.pem}
```

### Auto-Renewal Setup

```bash
# Enable automatic renewal
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer

# Test renewal (dry-run)
sudo certbot renew --dry-run

# Check renewal status
sudo certbot certificates

# Certbot renews automatically 30 days before expiration
```

### HTTPS with Node.js (Manual)

If not using Nginx/Caddy, configure Node directly:

```javascript
// src/server.ts (example)
import https from 'https';
import fs from 'fs';
import express from 'express';

const app = express();
const port = 443;

const options = {
    key: fs.readFileSync('/etc/letsencrypt/live/yourdomain.com/privkey.pem'),
    cert: fs.readFileSync('/etc/letsencrypt/live/yourdomain.com/fullchain.pem')
};

https.createServer(options, app).listen(port, () => {
    console.log(`HTTPS server running on port ${port}`);
});
```

### Nginx Reverse Proxy with SSL

See Section 6 for complete Nginx config with SSL termination.

---

## 6. Reverse Proxy Configuration

### Why Use a Reverse Proxy?

- SSL/TLS termination
- Load balancing
- WebSocket proxying
- Compression
- Security headers
- Virtual hosting

### Nginx Configuration

Create `/etc/nginx/sites-available/gravyclaw`:

```nginx
# HTTP to HTTPS redirect
server {
    listen 80;
    listen [::]:80;
    server_name yourdomain.com api.yourdomain.com;
    
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
    
    location / {
        return 301 https://$server_name$request_uri;
    }
}

# HTTPS server block
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name yourdomain.com api.yourdomain.com;

    # SSL Certificate paths
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    # SSL Configuration (modern security)
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_stapling on;
    ssl_stapling_verify on;
    ssl_trusted_certificate /etc/letsencrypt/live/yourdomain.com/chain.pem;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript;
    gzip_min_length 1000;

    # Location for Gravity Claw
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        proxy_connect_timeout 60s;
    }

    # WebSocket specific settings
    location /ws {
        proxy_pass http://localhost:3000/ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400s;
    }

    # Canvas endpoint (optional)
    location /canvas {
        proxy_pass http://localhost:3000/canvas;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Rate limiting (optional)
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req zone=api burst=20 nodelay;

    # Cache static files (optional)
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        proxy_pass http://localhost:3000;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # Deny access to sensitive files
    location ~ /gravity\.(db|db-wal|db-shm) {
        deny all;
    }

    location ~ /\.env {
        deny all;
    }

    location ~ /secrets\.(enc\.)?json {
        deny all;
    }
}
```

**Enable the site:**

```bash
# Create symlink to enabled sites
sudo ln -s /etc/nginx/sites-available/gravyclaw /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx

# Verify status
sudo systemctl status nginx
```

### Caddy Configuration

Alternative: [Caddy](https://caddyserver.com/) automatically handles SSL/TLS. Create `/etc/caddy/Caddyfile`:

```caddy
yourdomain.com api.yourdomain.com {
    # Automatic HTTPS
    encode gzip

    # WebSocket proxying
    @websocket {
        path /ws
        header Connection Upgrade
    }
    
    reverse_proxy @websocket localhost:3000 {
        header_uri -X-Forwarded-For
        header_up X-Forwarded-For {http.request.remote.host}
        header_up X-Forwarded-Proto {http.request.proto}
        header_up Host {http.request.host}
        
        # Keep websocket connections alive
        websocket
    }

    # API proxying
    reverse_proxy localhost:3000 {
        header_uri -X-Forwarded-For
        header_up X-Forwarded-For {http.request.remote.host}
        header_up X-Forwarded-Proto {http.request.proto}
        header_up Host {http.request.host}
    }

    # Security headers
    header Strict-Transport-Security "max-age=31536000; includeSubDomains"
    header X-Content-Type-Options "nosniff"
    header X-Frame-Options "SAMEORIGIN"

    # Rate limiting (optional, needs caddy-ratelimit plugin)
    ratelimit /api/* 10r/s
}
```

**Start Caddy:**

```bash
# Install Caddy
sudo apt-get install caddy

# Enable and start
sudo systemctl enable caddy
sudo systemctl start caddy

# Verify
sudo systemctl status caddy

# Caddy automatically manages Let's Encrypt certificates
```

### WebSocket Configuration

Both Nginx and Caddy examples above include WebSocket support:

```nginx
# Key headers for WebSocket proxying
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
proxy_read_timeout 3600s;
proxy_send_timeout 3600s;
```

### SSL Testing

```bash
# Test using curl
curl -I https://yourdomain.com

# Check certificate
openssl s_client -connect yourdomain.com:443

# Test with online tool
# https://www.ssllabs.com/ssltest/analyze.html?d=yourdomain.com

# Monitor certificate expiry
certbot certificates
```

---

## 7. Process Manager Setup

### PM2 (Node.js Process Manager)

PM2 keeps your app running with automatic restarts, clustering, and monitoring.

#### Install PM2

```bash
# Install globally
sudo npm install -g pm2

# Install in project (alternative)
npm install --save-dev pm2

# Verify
pm2 --version
```

#### Create ecosystem.config.js

Create file at project root:

```javascript
// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: "gravyclaw",
      script: "./src/index.ts",
      interpreter: "tsx",
      instances: 1,
      exec_mode: "cluster",        // Can be "fork" for single process
      
      // Environment
      env: {
        NODE_ENV: "production",
        LOG_LEVEL: "info",
        PORT: 3000
      },
      env_staging: {
        NODE_ENV: "staging",
        LOG_LEVEL: "debug",
        PORT: 3001
      },
      env_development: {
        NODE_ENV: "development",
        LOG_LEVEL: "debug",
        PORT: 3000
      },
      
      // Restart policies
      restart_delay: 4000,          // Delay between restarts (ms)
      max_restarts: 10,             // Max restarts in cron window
      min_uptime: "10s",            // Min uptime before prev crash considered
      
      // Logs
      error_file: "./logs/pm2-error.log",
      out_file: "./logs/pm2-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      
      // Watch mode (optional, for development)
      watch: ["src"],               // Auto-restart on file changes
      ignore_watch: ["logs", "node_modules", ".git"],
      watch_delay: 2000,
      
      // Memory limit (auto-restart if exceeded)
      max_memory_restart: "500M",
      
      // Shutdown
      kill_timeout: 5000,           // Time to wait before force kill
      listen_timeout: 3000,         // Time for app to listen on port
      
      // Other
      merge_logs: true,
      autorestart: true,
      exp_backoff_restart_delay: 100,
    }
  ],

  // Deploy configuration (optional)
  deploy: {
    production: {
      user: "gravyclaw",
      host: "yourdomain.com",
      ref: "origin/main",
      repo: "https://github.com/noorulahamed/gravityclaw.git",
      path: "/opt/gravyclaw",
      "post-deploy": "npm install && npm run typecheck && pm2 reload ecosystem.config.js --env production"
    }
  }
};
```

#### PM2 Commands

```bash
# Start application
pm2 start ecosystem.config.js --env production

# View status
pm2 status

# View logs
pm2 logs gravyclaw                # All logs
pm2 logs gravyclaw --err          # Errors only
pm2 logs gravyclaw --lines=100    # Last 100 lines

# Monitor in real-time
pm2 monit

# Restart application
pm2 restart gravyclaw

# Graceful reload (zero downtime)
pm2 reload gravyclaw

# Stop application
pm2 stop gravyclaw

# Delete from PM2
pm2 delete gravyclaw

# Save current process list
pm2 save

# Restore on startup
pm2 startup
pm2 unstartup
```

### Systemd Service File (Linux)

Alternative to PM2: native systemd service (simpler, but less features).

Create `/etc/systemd/system/gravyclaw.service`:

```ini
[Unit]
Description=Gravity Claw Personal AI Agent
After=network.target

[Service]
Type=simple
User=gravyclaw
WorkingDirectory=/opt/gravyclaw
Environment="NODE_ENV=production"
Environment="PATH=/home/gravyclaw/.nvm/versions/node/v20.x.x/bin"
ExecStart=/usr/bin/npm start
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=gravyclaw

# Resource limits
LimitNOFILE=65536
MemoryLimit=1G

[Install]
WantedBy=multi-user.target
```

#### Manage Systemd Service

```bash
# Reload daemon
sudo systemctl daemon-reload

# Enable on startup
sudo systemctl enable gravyclaw

# Start service
sudo systemctl start gravyclaw

# Check status
sudo systemctl status gravyclaw

# View logs
journalctl -u gravyclaw -f         # Follow logs
journalctl -u gravyclaw --lines=50 # Last 50 lines
journalctl -u gravyclaw -S "1 hour ago"  # Last hour

# Stop service
sudo systemctl stop gravyclaw

# Restart service
sudo systemctl restart gravyclaw
```

### Process Monitoring

```bash
# With PM2
pm2 monit
pm2 web              # Opens web dashboard on port 9615

# With system tools
top                  # CPU/Memory usage
ps aux | grep node
lsof -i :3000       # Check port usage
htop                # Enhanced top view
```

### Log Rotation

Create `/etc/logrotate.d/gravyclaw`:

```bash
/opt/gravyclaw/logs/*.log {
    daily
    rotate 14         # Keep 14 days of logs
    compress          # Compress old logs
    delaycompress     # Don't compress yesterday's logs
    missingok         # Don't error if file missing
    notifempty        # Don't rotate empty files
    create 0640 gravyclaw gravyclaw
}
```

Test: `sudo logrotate -f /etc/logrotate.d/gravyclaw`

---

## 8. Database Management

### SQLite WAL Mode

Gravity Claw uses SQLite in WAL (Write-Ahead Logging) mode for better concurrency:

```bash
# Check current journal mode
sqlite3 gravity.db "PRAGMA journal_mode;"
# Output: wal

# WAL files (created automatically)
gravity.db      # Main database file
gravity.db-wal  # Write-ahead log
gravity.db-shm  # Shared memory file
```

**Why WAL?**
- Better concurrency (readers don't block writers)
- Faster transactions
- Crash recovery

### Database Backup

#### Manual Backup

```bash
# Copy database file (simple but unsafe while running)
cp gravity.db gravity.db.backup-$(date +%Y%m%d-%H%M%S)

# Safe backup (with lock)
sqlite3 gravity.db ".backup gravity.db.backup-$(date +%Y%m%d-%H%M%S)"

# Check backup integrity
sqlite3 gravity.db.backup-20240104-120000 "PRAGMA integrity_check;"
```

#### Automated Daily Backup

Create `scripts/backup-db.sh`:

```bash
#!/bin/bash
set -e

APP_DIR="/opt/gravyclaw"
DB_PATH="$APP_DIR/gravity.db"
BACKUP_DIR="$APP_DIR/backups"
BACKUP_FILE="$BACKUP_DIR/gravity.db.backup-$(date +%Y%m%d-%H%M%S).sql"

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Dump database to SQL
sqlite3 "$DB_PATH" ".dump" > "$BACKUP_FILE"

# Compress
gzip "$BACKUP_FILE"

# Keep only last 30 days of backups
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +30 -delete

# Optional: Upload to cloud storage
# aws s3 cp "$BACKUP_FILE.gz" s3://your-bucket/backups/

echo "Backup created: $BACKUP_FILE.gz"
```

**Make executable and schedule with cron:**

```bash
chmod +x scripts/backup-db.sh

# Add to crontab
crontab -e

# Daily backup at 2 AM
0 2 * * * /opt/gravyclaw/scripts/backup-db.sh

# Verify cron jobs
crontab -l
```

### Database Integrity Checks

```bash
# Check integrity
sqlite3 gravity.db "PRAGMA integrity_check;"
# Output: ok

# Check fragmentation
sqlite3 gravity.db "PRAGMA freelist_count;"

# Defragment (optimize)
sqlite3 gravity.db "VACUUM;"

# Check page count
sqlite3 gravity.db "PRAGMA page_count;"
```

### Export/Import Data

```bash
# Export to SQL dump
sqlite3 gravity.db ".dump" > gravity.db.sql

# Export to CSV
sqlite3 gravity.db ".mode csv"
sqlite3 gravity.db "SELECT * FROM memory;" > memory.csv

# Import from SQL dump
sqlite3 gravity.db < gravity.db.sql

# Import from CSV (new table)
sqlite3 gravity.db ".mode csv"
sqlite3 gravity.db ".import memory.csv memory"
```

### Schema Inspection

```bash
# List all tables
sqlite3 gravity.db ".tables"
# Output: agent_swarms memory workflow_tasks workflows

# Inspect table structure
sqlite3 gravity.db ".schema memory"
sqlite3 gravity.db ".schema agent_swarms"

# Count rows
sqlite3 gravity.db "SELECT COUNT(*) FROM memory;"

# Check disk usage per table
sqlite3 gravity.db "SELECT name, page_count * page_size / 1024.0 / 1024.0 as size_mb FROM pragma_database_list;"
```

### Database Maintenance

```bash
# Optimize indexes
sqlite3 gravity.db "ANALYZE;"

# Rebuild indexes
sqlite3 gravity.db "REINDEX;"

# Check for unused indexes
sqlite3 gravity.db ".lint unused-indexes"

# Enable foreign key constraints
sqlite3 gravity.db "PRAGMA foreign_keys = ON;"
```

### Point-in-Time Restore

With WAL mode backups:

```bash
# 1. Stop the application
systemctl stop gravyclaw

# 2. Prepare restore point
cp gravity.db.backup-20240104-100000.sql gravity.db.restore

# 3. Restore
sqlite3 gravity.db.restore < gravity.db.backup-20240104-100000.sql

# 4. Verify integrity
sqlite3 gravity.db.restore "PRAGMA integrity_check;"

# 5. Replace old database
cp gravity.db gravity.db.corrupted
cp gravity.db.restore gravity.db

# 6. Start application
systemctl start gravyclaw
```

---

## 9. Monitoring & Logging

### Log File Locations

```
/opt/gravyclaw/logs/
├── app.log              # Main application logs
├── pm2-out.log          # PM2 stdout
├── pm2-error.log        # PM2 errors
└── error.log            # Error-level logs only
```

### Logging Configuration

Gravity Claw uses structured logging via [logger.ts](../src/logger.ts):

```bash
# In .env
LOG_LEVEL=info  # debug | info | warn | error

# Log levels include timestamp, prefix, and level
[2024-01-04T12:34:56.789Z] [db] INFO: Connected to SQLite DB
[2024-01-04T12:34:56.812Z] [agent] DEBUG: Processing message...
```

### View Logs in Real-Time

```bash
# Follow application logs
tail -f /opt/gravyclaw/logs/app.log

# Search logs for errors
grep ERROR /opt/gravyclaw/logs/app.log

# Stream specific prefix
tail -f /opt/gravyclaw/logs/app.log | grep "agent\|tool"

# Last N lines
tail -n 50 /opt/gravyclaw/logs/app.log

# Search by timestamp range
grep "2024-01-04T12" /opt/gravyclaw/logs/app.log
```

### Health Check Endpoint

Add health check to your application (if not already present):

```javascript
// src/server.ts example
import express from 'express';
import { db } from './db.ts';

const app = express();

app.get('/health', (req, res) => {
    try {
        // Check database
        const result = db.prepare('SELECT 1').get();
        
        return res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            memory: process.memoryUsage()
        });
    } catch (err) {
        return res.status(503).json({
            status: 'error',
            error: err instanceof Error ? err.message : 'Unknown error'
        });
    }
});
```

**Monitor health:**

```bash
# Test endpoint
curl -I http://localhost:3000/health

# Continuous monitoring
watch -n 5 'curl -s http://localhost:3000/health | jq .'

# Nagios/Icinga check
check_http -H localhost -u /health -e 200
```

### Monitoring Best Practices

1. **Resource Monitoring:**
   ```bash
   # Monitor CPU/Memory continuously
   while true; do
     echo "=== $(date) ==="
     ps aux | grep node
     free -h
     sleep 10
   done
   ```

2. **Log Analysis:**
   ```bash
   # Count messages per prefix
   awk -F']' '{print $2}' logs/app.log | sort | uniq -c | sort -rn
   
   # Errors per hour
   grep ERROR logs/app.log | awk -F'T' '{print $2}' | cut -d: -f1 | sort | uniq -c
   ```

3. **Alerting Setup** (example with PM2):
   ```bash
   # PM2 auto-restart on memory limit
   pm2 start app --max-memory-restart 500M
   
   # Website monitoring (external)
   # Use: https://uptimerobot.com or similar
   ```

4. **Metrics Collection:**
   - CPU usage
   - Memory usage
   - Database size
   - Log file sizes
   - Error rate
   - Response latency

---

## 10. Backup & Restore

### Automated Daily Backups

Set up the backup script from Section 8:

```bash
#!/bin/bash
# /home/gravyclaw/backup-gravyclaw.sh

set -e

APP_DIR="/opt/gravyclaw"
BACKUP_DIR="/opt/backups/gravyclaw"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Backup database
sqlite3 "$APP_DIR/gravity.db" ".dump" | gzip > "$BACKUP_DIR/gravity.db-$TIMESTAMP.sql.gz"

# Backup secrets
cp "$APP_DIR/secrets.enc.json" "$BACKUP_DIR/secrets.enc.json-$TIMESTAMP"

# Backup memory files
tar -czf "$BACKUP_DIR/memory-files-$TIMESTAMP.tar.gz" "$APP_DIR/memory-files"

# Backup configuration
cp "$APP_DIR/.env" "$BACKUP_DIR/.env-$TIMESTAMP"

# Keep only 30 days of backups
find "$BACKUP_DIR" -type f -mtime +30 -delete

# Log backup
echo "$(date '+%Y-%m-%d %H:%M:%S') Backup completed: $BACKUP_DIR" >> /var/log/gravyclaw-backup.log

# Optional: Upload to cloud
# aws s3 sync "$BACKUP_DIR" s3://your-bucket/gravyclaw-backups/
```

**Schedule with cron:**

```bash
# Edit crontab
crontab -e

# Daily backup at 2 AM
0 2 * * * /home/gravyclaw/backup-gravyclaw.sh

# Backup logs
0 3 * * * gzip -c /var/log/gravyclaw-backup.log > /opt/backups/gravyclaw/backup.log-$(date +\%Y\%m\%d).gz
```

### Manual Backup Procedure

```bash
# Stop the application
sudo systemctl stop gravyclaw

# Create backup
sudo su - gravyclaw
cd /opt/gravyclaw
sqlite3 gravity.db ".backup gravity.db.backup-$(date +%Y%m%d-%H%M%S)"
cp secrets.enc.json secrets.enc.json-$(date +%Y%m%d-%H%M%S)
tar -czf memory-files-backup-$(date +%Y%m%d-%H%M%S).tar.gz memory-files

# Store backups securely (local or cloud)
cp gravity.db.backup-* /opt/backups/
cp secrets.enc.json-* /opt/backups/
cp memory-files-backup-*.tar.gz /opt/backups/

# Start application
sudo systemctl start gravyclaw
```

### Point-in-Time Restore

```bash
# 1. List available backups
ls -lh /opt/backups/gravyclaw/

# 2. Stop application
sudo systemctl stop gravyclaw

# 3. Prepare restore point
sudo su - gravyclaw
cd /opt/gravyclaw
sqlite3 gravity.db.backup-20240104-120000.sql ".restore gravity.db.restore"

# 4. Verify integrity
sqlite3 gravity.db.restore "PRAGMA integrity_check;" | head -1

# 5. Replace database
cp gravity.db gravity.db.corrupted-$(date +%Y%m%d)
cp gravity.db.backup-20240104-120000.sql gravity.db

# 6. Restore memory files if needed
rm -rf memory-files
tar -xzf /opt/backups/gravyclaw/memory-files-backup-20240104-120000.tar.gz

# 7. Start application
sudo systemctl start gravyclaw

# 8. Verify logs show normal startup
journalctl -u gravyclaw -f
```

### Cloud Backup Options

#### AWS S3 Backup

```bash
# Install AWS CLI
sudo apt-get install awscli

# Configure credentials
aws configure

# Upload backups
aws s3 sync /opt/backups/gravyclaw s3://my-backups/gravyclaw/ \
  --storage-class GLACIER_IR \
  --delete

# Alternative: Add to cron (set credentials in ~/.aws/credentials)
*/6 * * * * /usr/bin/aws s3 sync /opt/backups/gravyclaw s3://my-backups/gravyclaw/ --storage-class GLACIER_IR --delete
```

#### Backblaze B2

```bash
# Install B2 CLI
pip install b2

# Authorize
b2 authorize-account your-app-key-id your-app-key

# Upload
b2 sync --threads 4 /opt/backups/gravyclaw b2://my-bucket/gravyclaw/

# Add to cron
30 2 * * * /usr/bin/b2 sync --threads 4 /opt/backups/gravyclaw b2://my-bucket/gravyclaw/
```

---

## 11. Scaling Considerations

### Single Instance Limitations

A single instance supports:
- **~100-1000** concurrent user conversations (depending on LLM API rate limits)
- **~10-100** tool executions per second (depends on tool complexity)
- **~1GB** SQLite database (practical limit before performance degrades)

### Scaling Beyond Single Instance

#### Option 1: Horizontal Scaling (Multiple Servers)

For multi-instance setup:

```
┌─────────────────────────────────────────┐
│          Load Balancer (Nginx)          │
└────────────┬────────────────────────────┘
             │
     ┌───────┴───────┐
     │               │
   ┌─▼────┐    ┌────▼─┐
   │Node 1│    │Node 2│
   └──────┘    └──────┘
       │           │
       └──────┬────┘
              │
         ┌────▼─────┐
         │PostgreSQL│
         │  (shared) │
         └──────────┘
```

**Requirements:**
1. Switch from SQLite to PostgreSQL
   ```bash
   # Would require code changes to use postgres driver
   npm install --save pg
   ```

2. Load balancer (Nginx):
   ```nginx
   upstream gravyclaw_backend {
       server node1.internal:3000 weight=1;
       server node2.internal:3000 weight=1;
       keepalive 32;
   }
   
   server {
       listen 80;
       location / {
           proxy_pass http://gravyclaw_backend;
       }
   }
   ```

3. Shared session storage (Redis recommended):
   ```bash
   npm install --save redis
   ```

#### Option 2: Database Optimization (SQLite Focus)

Optimize for larger single instance:

```sql
-- Create indexes for common queries
CREATE INDEX idx_memory_session_timestamp 
  ON memory(session_id, timestamp DESC);

CREATE INDEX idx_agent_swarms_status 
  ON agent_swarms(status);

-- Analyze for query optimization
PRAGMA optimize;

-- Periodic maintenance
VACUUM;
ANALYZE;
```

#### Option 3: Read Replicas (SQLite)

Use Litestream for continuous replication:

```bash
# Install Litestream
wget https://github.com/benbjohnson/litestream/releases/download/v0.3.13/litestream-v0.3.13-linux-amd64.tar.gz
tar -xzf litestream-v0.3.13-linux-amd64.tar.gz
sudo mv litestream /usr/local/bin/

# Configure /etc/litestream.yml
dbs:
  - path: /opt/gravyclaw/gravity.db
    replicas:
      - type: s3
        bucket: my-bucket
        path: litestream/gravity.db
```

### Connection Pooling (if using PostgreSQL)

```javascript
// With PgBoss for job queues
import PgBoss from 'pg-boss';

const boss = new PgBoss({
    host: 'postgres.internal',
    database: 'gravyclaw',
    max: 10  // Connection pool size
});

await boss.start();
```

### Rate Limiting (Prevent Overload)

```javascript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,                  // Limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP'
});

app.use('/api/', limiter);
```

### Caching Strategy

```javascript
// Add Redis caching
import redis from 'redis';

const client = redis.createClient({
    host: 'redis.internal',
    port: 6379
});

// Cache conversation summaries
await client.set(
    `session:${sessionId}:summary`,
    JSON.stringify(summary),
    { EX: 3600 }  // 1 hour TTL
);
```

### Database Optimization for Scaling

```bash
# Monitor database performance
sqlite3 gravity.db "PRAGMA stats;" | tail -20

# Rebuild indexes
sqlite3 gravity.db "REINDEX;"

# Check query performance
sqlite3 gravity.db ".eqp on"
sqlite3 gravity.db "SELECT COUNT(*) FROM memory WHERE session_id='test';"

# Vacuum and optimize
sqlite3 gravity.db "VACUUM; ANALYZE;"
```

---

## 12. Troubleshooting

### Common Issues and Solutions

#### Application Won't Start

```bash
# Check for port conflicts
lsof -i :3000
# Kill process if needed
kill -9 <PID>

# Check logs
journalctl -u gravyclaw -n 50 --no-pager

# Verify configuration
npm run cli -- doctor

# Check Node version
node --version  # Must be 20+
```

#### Database Locked

```bash
# Check database locks
sqlite3 gravity.db ".open --readonly"

# Clear WAL files (if corrupted)
rm gravity.db-wal gravity.db-shm
sqlite3 gravity.db "PRAGMA integrity_check;"

# Rebuild database
sqlite3 gravity.db "VACUUM;"
```

#### High Memory Usage

```bash
# Check memory usage
ps aux | grep "node\|npm" | grep -v grep

# Set memory limit in PM2
pm2 start app --max-memory-restart 500M

# Monitor memory over time
watch -n 1 'ps aux | grep node | grep -v grep | awk "{print \$6}"'
```

#### Telegram Bot Not Responding

```bash
# Verify token
npm run cli -- config | grep TELEGRAM_BOT_TOKEN

# Check webhook status
curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo" | jq

# Test with @BotFather
# If webhook fails, bot may not be receiving updates
```

#### SSL Certificate Issues

```bash
# Check certificate expiry
openssl x509 -in /etc/letsencrypt/live/yourdomain.com/cert.pem -noout -dates

# Test SSL
openssl s_client -connect yourdomain.com:443 -brief

# Verify automatic renewal
sudo certbot renew --dry-run
```

### Debug Mode

Enable debug logging:

```bash
# In .env
LOG_LEVEL=debug

# Or set at runtime
LOG_LEVEL=debug npm start

# With verbose PM2 logging
pm2 start app --interpreter=tsx --update-env
```

### Log Analysis

```bash
# Find errors in logs
grep -i error /opt/gravyclaw/logs/app.log | tail -20

# Count error types
grep ERROR /opt/gravyclaw/logs/app.log | awk -F': ' '{print $2}' | sort | uniq -c

# Timeline of issues
grep -E "ERROR|WARN" /opt/gravyclaw/logs/app.log | tail -50

# Track specific session
grep "sessionId:abc123" /opt/gravyclaw/logs/app.log
```

### Performance Diagnostics

```bash
# Database size
du -sh /opt/gravyclaw/gravity.db*

# Log file sizes
du -sh /opt/gravyclaw/logs/*

# Memory files size
du -sh /opt/gravyclaw/memory-files

# Query performance
sqlite3 gravity.db "EXPLAIN QUERY PLAN SELECT * FROM memory WHERE session_id='test';"

# Slow queries (requires logging configuration)
grep "duration" /opt/gravyclaw/logs/app.log | sort -t= -k2 -rn | head -10
```

### Recovery Procedures

#### Application Crash Recovery

```bash
# 1. Check status
systemctl status gravyclaw

# 2. View recent error logs
journalctl -u gravyclaw -n 100 --no-pager

# 3. Check database integrity
sqlite3 /opt/gravyclaw/gravity.db "PRAGMA integrity_check;" | head -1

# 4. If corrupted, restore from backup
systemctl stop gravyclaw
# Follow POINT-IN-TIME RESTORE section

# 5. Restart
systemctl restart gravyclaw

# 6. Verify startup
systemctl status gravyclaw
```

#### Stuck Processes

```bash
# Find stuck node processes
ps aux | grep node

# Force kill (use with caution)
pkill -9 node

# Clean exit with PM2
pm2 kill
pm2 start ecosystem.config.js --env production

# Check for zombie processes
ps aux | grep defunct
```

#### Webhook/API Errors

```bash
# Test webhook endpoint
curl -v http://localhost:3000/webhook

# Check network connectivity
ping -c 1 api.telegram.org

# Test API calls with curl
curl -X GET "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe"

# Enable request logging in code (dev only)
// Add to src/server.ts
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});
```

### Getting Help

1. **Check documentation:** [docs/](../docs/)
2. **Review logs:** `journalctl -u gravyclaw -f`
3. **Run diagnostics:** `npm run cli -- doctor`
4. **GitHub Issues:** [Create an issue](https://github.com/noorulahamed/gravityclaw/issues)
5. **Enable debug mode:** `LOG_LEVEL=debug npm start`

---

## Additional Resources

- **Repository:** [github.com/noorulahamed/gravityclaw](https://github.com/noorulahamed/gravityclaw)
- **CLI Guide:** [docs/CLI.md](CLI.md)
- **Configuration:** [docs/ENCRYPTED_SECRETS.md](ENCRYPTED_SECRETS.md)
- **Architecture:** [docs/](../docs/)

---

**Last Updated:** March 2024
**Status:** Gravity Claw v0.1.0 (Early Development)
