# Authorization & Audit Logging

GravityClaw enforces strict security boundaries using a combination of Single Sign-On (SSO), Role-Based Access Control (RBAC), and comprehensive Audit Logging.

## Single Sign-On (SSO)
Located in `src/auth/sso.ts`, GravityClaw supports SSO integration for corporate environments. This allows administrators to map existing organizational groups to GravityClaw roles seamlessly.

### Configuration
Enable SSO in your `.env`:
```bash
AUTH_SSO_ENABLED=true
AUTH_SSO_PROVIDER=oauth2 # or saml
AUTH_SSO_CLIENT_ID=your_client_id
```

## Role-Based Access Control (RBAC)
Located in `src/auth/rbac.ts`, the RBAC system defines what users (or agents) can do.

### Roles
- **Admin**: Full access to all endpoints, tools, and configurations.
- **Developer**: Access to tool development, logs, and sandbox environments.
- **User**: Standard interaction with assigned agents.
- **Agent**: Internal role for autonomous agents restricted to their specific sandbox and permitted tools.

### Enforcement
Middleware ensures every request has the required roles:
```typescript
import { requireRole } from '../auth/rbac.js';

router.post('/admin/config', requireRole(['Admin']), handleConfigUpdate);
```
Tools are also filtered based on the current user's role before being presented to the LLM.

## Audit Logging
Located in `src/audit/`, the audit logging system provides an immutable trail of actions.

- **Storage**: Audit logs are written to a dedicated SQLite database or forwarded to a SIEM via webhooks.
- **Events Tracked**: Logins, configuration changes, dangerous tool invocations (e.g., shell access), and role modifications.

### Viewing Audit Logs
Administrators can view audit logs via the CLI:
```bash
npm run cli -- audit --tail 100
```
