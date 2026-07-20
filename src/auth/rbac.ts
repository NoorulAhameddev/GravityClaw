import type { Request, Response, NextFunction } from "express";
import { createLogger } from "../logger.ts";
import type { AuthenticatedRequest } from "../middleware/auth.ts";

const log = createLogger("rbac");

export type Permission =
    | "session:read" | "session:write" | "session:delete"
    | "tools:execute" | "tools:admin"
    | "users:manage" | "users:read"
    | "settings:read" | "settings:write"
    | "admin:all";

export type Role = "admin" | "user" | "viewer" | "custom";

const RBAC_MATRIX: Record<Role, Permission[]> = {
    admin: ["session:read", "session:write", "session:delete", "tools:execute",
            "tools:admin", "users:manage", "users:read", "settings:read",
            "settings:write", "admin:all"],
    user: ["session:read", "session:write", "tools:execute", "users:read",
           "settings:read"],
    viewer: ["session:read", "users:read", "settings:read"],
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
        const role = ((req as any).user?.role || (req as any).role || "viewer") as Role;

        const userPermissions = getPermissions(role);
        const hasAll = permissions.every(p => userPermissions.includes(p));

        if (!hasAll) {
            log.warn(`RBAC denied: role=${role} required=${permissions.join(",")} path=${req.path}`);
            res.status(403).json({
                error: "Insufficient permissions",
                required: permissions,
                missing: permissions.filter(p => !userPermissions.includes(p)),
            });
            return;
        }

        next();
    };
}

export function requireRole(...roles: Role[]) {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        const role = ((req as any).user?.role || (req as any).role || "viewer") as Role;

        if (!roles.includes(role)) {
            log.warn(`RBAC role denied: role=${role} required=${roles.join(",")}`);
            res.status(403).json({ error: "Insufficient role", required: roles });
            return;
        }

        next();
    };
}
