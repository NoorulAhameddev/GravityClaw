# CC6 — Logical & Physical Access Controls

## CC6.1 — Logical Access Security

Authentication, authorization, and identity management.

**Implementation:**
- API key validation via `src/middleware/auth.ts` with constant-time comparison
- JWT tokens for WebSocket and SSO auth via `src/middleware/websocket-auth.ts`
- RBAC permission matrix in `src/auth/rbac.ts`
- SSO/SAML/OIDC in `src/auth/sso.ts`

**Evidence:** Auth middleware tests, RBAC integration tests

## CC6.2 — Physical Access Security

Infrastructure hosted on AWS with restricted IAM roles.

**Implementation:**
- AWS ECS Fargate with security groups
- Terraform-managed infrastructure
- No direct server access

## CC6.3 — User Provisioning

**Implementation:**
- Admin users API (`src/routes/admin/users.ts`)
- Role assignment (admin, user, viewer)
- Audit trail for all user management actions

## CC6.7 — Encryption

**Implementation:**
- At rest: SQLite WAL mode, AES-256-GCM for secrets via `src/secrets/kms.ts`
- In transit: TLS 1.3 via nginx reverse proxy
- Key rotation via `rotateMasterKey()`
