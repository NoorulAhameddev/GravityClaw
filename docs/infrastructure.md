# Infrastructure

This document describes the infrastructure configuration for Gravity Claw, covering local development, Docker deployment, and production AWS provisioning via Terraform.

---

## Local Development

```bash
npm run dev     # tsx watch with auto-reload
npm start       # Production start with 512MB heap limit
```

The server starts on port 3000 by default. See [environment.md](environment.md) for all configuration options.

---

## Docker (Development)

A single `docker-compose.yml` runs the app:

```yaml
services:
  gravyclaw:
    build: .
    ports: ["3000:3000"]
    volumes:
      - ./.env:/app/.env
      - ./gravity.db:/app/gravity.db
      - ./secrets.enc.json:/app/secrets.enc.json
      - ./memory-files:/app/memory-files
    deploy:
      resources:
        limits: { memory: 1G }
        reservations: { memory: 512M }
```

```bash
docker compose up -d
```

---

## Docker (Production / Swarm)

A production compose file (`docker-compose.prod.yml`) targets Docker Swarm with three services:

| Service | Replicas | Resources | Healthcheck |
|---------|----------|-----------|-------------|
| **app** | 3 | 1 CPU / 1G | `GET /api/live` |
| **redis** | 1 | 256M | `redis-cli ping` |
| **nginx** | 2 | 128M | — |

```bash
# Deploy to Swarm
docker stack deploy -c docker-compose.prod.yml gravityclaw
```

**Requirements:**
- Docker Swarm cluster initialized
- SSL certificates mounted at paths in `nginx.conf`
- Environment variables set (recommended: via Docker secrets)

**nginx** acts as a reverse proxy with:
- `least_conn` load balancing across app replicas
- HTTP/HTTPS (HTTP/2) on `gravityclaw.local`
- WebSocket support (`Upgrade`/`Connection` headers)
- 60s proxy timeouts

---

## AWS (Terraform)

Terraform configs at `infrastructure/terraform/` provision a production AWS stack.

### Architecture

```
Internet → ALB → ECS (Fargate) → Redis (ElastiCache)
                           ↓
                      S3 (Attachments)
                           ↓
                  CloudWatch (Logs + Alarms)
```

### Prerequisites

```bash
cd infrastructure/terraform
terraform init
```

### Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `aws_region` | `us-east-1` | AWS region |
| `environment` | `production` | Environment name |
| `alarm_email` | `ops@gravityclaw.dev` | CloudWatch alarm notification email |

### Resources Provisioned

| Resource | Details |
|----------|---------|
| **VPC** | `10.0.0.0/16` with public/private subnets |
| **ECS Cluster** | Fargate launch type |
| **ECS Task Def** | `registry.gravityclaw.io/gravityclaw:latest`, port 3000, CloudWatch logs |
| **ECS Service** | Auto-scaling (min 2, max 20, desired 2), 1024 CPU / 2048 MB |
| **ALB** | Application Load Balancer (DNS exposed as output) |
| **ElastiCache Redis** | `cache.t3.small` in private subnets |
| **S3 Bucket** | `gravityclaw-attachments-{environment}` |
| **Security Groups** | App SG attached to VPC |
| **CloudWatch** | Dashboard + alarm email |

### Outputs

```bash
terraform output alb_dns
terraform output redis_endpoint
terraform output attachment_bucket
```

### Notes

- Container image tag is hardcoded — update `main.tf` for your registry
- Secrets should use AWS Secrets Manager for production (currently passed as env vars)
- No RDS instance is provisioned; `DATABASE_URL` must be provided externally or add an `aws_db_instance` resource

---

## CI/CD

CI/CD pipeline is not yet configured. Recommended setup:

```yaml
# .github/workflows/deploy.yml
on:
  push:
    branches: [main]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run typecheck
      - run: npm run test:run

  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && npm run build
      - run: docker build -t registry.gravityclaw.io/gravityclaw:${{ github.sha }} .
      - run: docker push registry.gravityclaw.io/gravityclaw:${{ github.sha }}
      - run: terraform apply -auto-approve
```

**Last Updated**: July 19, 2026
