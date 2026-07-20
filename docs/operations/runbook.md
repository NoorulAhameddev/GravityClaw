# Production Runbook

## On-Call Rotation
- Primary: @sre-lead
- Secondary: @backend-lead
- Escalation: @engineering-manager

## Incident Severity Levels

| Level | Response Time | Examples |
|-------|--------------|----------|
| SEV1 | 15min | Service down, data loss |
| SEV2 | 1hr | Degraded performance, partial outage |
| SEV3 | 4hr | Non-critical bug, UI issue |
| SEV4 | Next sprint | Minor issue, enhancement |

## Common Procedures

### 1. Service Unreachable
```bash
# Check health endpoints
curl -f http://localhost:3000/api/live
curl -f http://localhost:3000/api/ready

# Check Docker logs
docker compose logs app --tail 100

# Check resource usage
docker stats $(docker ps -q)

# Restart if needed
docker compose restart app
```

### 2. High Latency
```bash
# Check metrics
curl http://localhost:3000/api/metrics/prometheus | grep gravityclaw

# Check LLM provider status
# Anthropic: https://status.anthropic.com
# OpenAI: https://status.openai.com

# Scale up
docker compose up -d --scale app=5
```

### 3. Database Issues
```bash
# Check SQLite disk usage
# Verify disk space
df -h /data

# Run integrity check
sqlite3 data/gravity.db "PRAGMA integrity_check;"

# Check connection count
lsof -i :3000 | wc -l
```

### 4. LLM Provider Outage
- Provider failover is automatic via the failover provider chain
- Check provider status pages
- If all providers down, set maintenance mode

## Health Dashboard
URL: https://status.gravityclaw.dev
PagerDuty: gravityclaw-prod
Slack: #oncall-alerts
