import { Router } from "express";
import { authMiddleware } from "../middleware/auth.ts";
import { requirePermission } from "../auth/rbac.ts";
import { pluginRegistry } from "../plugins/registry.ts";
import { createLogger } from "../logger.ts";

const log = createLogger("plugins-route");
export const router = Router();

router.use(authMiddleware);

router.get("/", requirePermission("tools:execute"), (_req, res) => {
    try {
        const plugins = pluginRegistry.list();
        const list = plugins.map(p => ({
            name: p.name,
            version: p.version,
            description: p.description,
            author: p.author,
            tools: p.tools,
        }));
        res.json({ success: true, data: list });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: msg });
    }
});

router.post("/install", requirePermission("tools:admin"), async (req, res) => {
    try {
        const { source } = req.body;
        if (!source) return res.status(400).json({ success: false, error: "source is required" });

        const manifest = await pluginRegistry.install(source);
        log.info(`Plugin installed via API: ${manifest.name}`);
        res.status(201).json({ success: true, data: manifest });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: msg });
    }
});

router.post("/:name/uninstall", requirePermission("tools:admin"), async (req, res) => {
    try {
        const name = req.params.name as string;
        await pluginRegistry.uninstall(name);
        log.info(`Plugin uninstalled via API: ${name}`);
        res.json({ success: true });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: msg });
    }
});

router.get("/:name", requirePermission("tools:execute"), (req, res) => {
    try {
        const name = req.params.name as string;
        const plugin = pluginRegistry.getPlugin(name);
        if (!plugin) return res.status(404).json({ success: false, error: "Plugin not found" });
        res.json({ success: true, data: plugin });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: msg });
    }
});
