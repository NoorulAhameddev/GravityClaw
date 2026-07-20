import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.ts";
import { requirePermission } from "../../auth/rbac.ts";
import { db } from "../../db.ts";
import { createLogger } from "../../logger.ts";

const log = createLogger("admin-users");
export const router = Router();

router.use(authMiddleware);

router.get("/", requirePermission("users:read"), (req, res) => {
    try {
        const users = db.prepare("SELECT id, role, created_at, updated_at FROM users ORDER BY created_at DESC").all();
        res.json({ success: true, data: users });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get("/:id", requirePermission("users:read"), (req, res) => {
    try {
        const user = db.prepare("SELECT id, role, created_at, updated_at FROM users WHERE id = ?").get(req.params.id);
        if (!user) return res.status(404).json({ success: false, error: "User not found" });
        res.json({ success: true, data: user });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post("/", requirePermission("users:manage"), (req, res) => {
    try {
        const { id, role } = req.body;
        if (!id) return res.status(400).json({ success: false, error: "id is required" });

        db.prepare("INSERT INTO users (id, role) VALUES (?, ?)").run(id, role || "user");
        log.info(`User created: ${id} role=${role}`);
        res.status(201).json({ success: true, data: { id, role: role || "user" } });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.patch("/:id/role", requirePermission("users:manage"), (req, res) => {
    try {
        const { role } = req.body;
        if (!role) return res.status(400).json({ success: false, error: "role is required" });

        db.prepare("UPDATE users SET role = ?, updated_at = datetime('now') WHERE id = ?").run(role, req.params.id);
        log.info(`User role updated: ${req.params.id} role=${role}`);
        res.json({ success: true, data: { id: req.params.id, role } });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.delete("/:id", requirePermission("users:manage"), (req, res) => {
    try {
        db.prepare("DELETE FROM users WHERE id = ?").run(req.params.id);
        log.info(`User deleted: ${req.params.id}`);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});
