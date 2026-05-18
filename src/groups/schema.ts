/**
 * Group Management Schema
 * 
 * Database schema for managing group chat settings and permissions.
 */

import { db } from "../db.ts";
import { createLogger } from "../logger.ts";

const log = createLogger("group-schema");

// Group management schema initialization is now handled centrally by src/db/migrations/schema.ts
