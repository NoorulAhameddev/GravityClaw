import type { Request, Response, NextFunction } from 'express';
import { createLogger } from '../logger.ts';
import type { AuthenticatedRequest } from '../middleware/auth.ts';

const log = createLogger('rbac');

export type Permission =
  | 'session:read'
  | 'session:write'
  | 'session:delete'
  | 'tools:execute'
  | 'tools:admin'
  | 'users:manage'
  | 'users:read'
  | 'settings:read'
  | 'settings:write'
  | 'admin:all';

export type Role = 'admin' | 'user' | 'viewer' | 'custom';

const RBAC_MATRIX: Record<Role, Permission[]> = {
  admin: [
    'session:read',
    'session:write',
    'session:delete',
    'tools:execute',
    'tools:admin',
    'users:manage',
    'users:read',
    'settings:read',
    'settings:write',
    'admin:all',
  ],
  user: ['session:read', 'session:write', 'tools:execute', 'users:read', 'settings:read'],
  viewer: ['session:read', 'users:read', 'settings:read'],
  custom: [],
};

export function getPermissions(role: Role): Permission[] {
  return RBAC_MATRIX[role] ?? RBAC_MATRIX.viewer;
}

export function hasPermission(role: Role, permission: Permission): boolean {
  return getPermissions(role).includes(permission);
}

export function requirePermission(...permissions: Permission[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const role = ((req as any).user?.role || (req as any).role || 'viewer') as Role;

    const userPermissions = getPermissions(role);
    const hasAll = permissions.every((p) => userPermissions.includes(p));

    if (!hasAll) {
      log.warn(`RBAC denied: role=${role} required=${permissions.join(',')} path=${req.path}`);
      res.status(403).json({
        error: 'Insufficient permissions',
        required: permissions,
        missing: permissions.filter((p) => !userPermissions.includes(p)),
      });
      return;
    }

    next();
  };
}

export function requireRole(...roles: Role[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const role = ((req as any).user?.role || (req as any).role || 'viewer') as Role;

    if (!roles.includes(role)) {
      log.warn(`RBAC role denied: role=${role} required=${roles.join(',')}`);
      res.status(403).json({ error: 'Insufficient role', required: roles });
      return;
    }

    next();
  };
}

export type AgentRole = 'primary' | 'researcher' | 'coder' | 'reviewer' | 'summarizer';

export interface AgentCapabilityProfile {
  role: string;
  description: string;
  deniedTools: string[];
  canExecuteShell: boolean;
  canMutateFileSystem: boolean;
}

const DEFAULT_RESEARCHER_PROFILE: AgentCapabilityProfile = {
  role: 'researcher',
  description: 'Web research and information retrieval agent',
  deniedTools: ['delete_file', 'file_delete', 'run_shell', 'write_file', 'plugin_install'],
  canExecuteShell: false,
  canMutateFileSystem: false,
};

export const AGENT_CAPABILITY_PROFILES: Record<string, AgentCapabilityProfile> = {
  primary: {
    role: 'primary',
    description: 'Primary agent loop under owner oversight',
    deniedTools: [],
    canExecuteShell: true,
    canMutateFileSystem: true,
  },
  researcher: DEFAULT_RESEARCHER_PROFILE,
  coder: {
    role: 'coder',
    description: 'Code development and testing agent in workspace sandbox',
    deniedTools: ['delete_file', 'file_delete'],
    canExecuteShell: false,
    canMutateFileSystem: true,
  },
  reviewer: {
    role: 'reviewer',
    description: 'Code and artifact review agent (read-only)',
    deniedTools: ['delete_file', 'file_delete', 'run_shell', 'write_file'],
    canExecuteShell: false,
    canMutateFileSystem: false,
  },
  summarizer: {
    role: 'summarizer',
    description: 'Context distillation and summarization agent',
    deniedTools: ['delete_file', 'file_delete', 'run_shell', 'write_file', 'browser_navigate'],
    canExecuteShell: false,
    canMutateFileSystem: false,
  },
};

export function filterToolsForAgentRole<T extends { name: string }>(role: string, tools: T[]): T[] {
  const profile = AGENT_CAPABILITY_PROFILES[role] ?? DEFAULT_RESEARCHER_PROFILE;
  return tools.filter((tool) => !profile.deniedTools.includes(tool.name));
}
