export { createBackupTool } from "./createBackupTool.ts";
export { restoreBackupTool } from "./restoreBackupTool.ts";
export { listBackupsTool } from "./listBackupsTool.ts";
export { deleteBackupTool } from "./deleteBackupTool.ts";
export { getBackupStatusTool } from "./getBackupStatusTool.ts";
export { verifyBackupTool } from "./verifyBackupTool.ts";

import { createBackupTool } from "./createBackupTool.ts";
import { restoreBackupTool } from "./restoreBackupTool.ts";
import { listBackupsTool } from "./listBackupsTool.ts";
import { deleteBackupTool } from "./deleteBackupTool.ts";
import { getBackupStatusTool } from "./getBackupStatusTool.ts";
import { verifyBackupTool } from "./verifyBackupTool.ts";

export const backupTools = [
    createBackupTool,
    restoreBackupTool,
    listBackupsTool,
    deleteBackupTool,
    getBackupStatusTool,
    verifyBackupTool,
];
