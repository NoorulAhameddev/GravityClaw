#!/usr/bin/env node

/**
 * Secret Manager CLI Tool
 * 
 * Command-line interface for managing encrypted secrets with rotation, audit logging, and exports.
 * 
 * Usage:
 *   npm run secret:generate              - Generate new MASTER_KEY
 *   npm run secret:list                  - List all secrets
 *   npm run secret:audit [filters]       - View access logs
 *   npm run secret:rotate                - Rotate expired secrets
 *   npm run secret:export --output FILE  - Export all secrets (encrypted)
 *   npm run secret:import --input FILE   - Import secrets (encrypted)
 * 
 * Or run directly:
 *   npx node scripts/secret-manager.ts <command> [options]
 */

import { program } from "commander";
import * as fs from "fs";
import * as path from "path";
import {
  generateMasterKey,
  loadSecretsFile,
  addSecret,
  listSecrets,
  deleteSecret,
  getSecretAccessLog,
  getExpiringSecrets,
  cleanupExpiredSecrets,
  isSecretExpired,
} from "../src/secrets.ts";
import { config } from "../src/config.ts";
import { createLogger } from "../src/logger.ts";
import { db } from "../src/db.ts";

const logger = createLogger("secret-manager");

/**
 * Ensure MASTER_KEY is available
 */
function getMasterKey(): string {
  const key = process.env.MASTER_KEY || config.MASTER_KEY;
  if (!key) {
    logger.error("❌ MASTER_KEY not set. Set MASTER_KEY env var or generate one with: npm run secret:generate");
    process.exit(1);
  }
  return key;
}

/**
 * Command: Generate new MASTER_KEY
 */
function cmdGenerateKey(): void {
  const key = generateMasterKey();
  console.log("\n✨ Generated new MASTER_KEY:\n");
  console.log(`   ${key}\n`);
  console.log("📝 Add this to your .env file:");
  console.log(`   MASTER_KEY=${key}\n`);
  console.log("⚠️  NEVER commit this to Git or share it!\n");
}

/**
 * Command: List all secrets
 */
async function cmdListSecrets(): Promise<void> {
  const secretsPath = path.join(process.cwd(), "secrets.enc.json");
  
  try {
    const secrets = await listSecrets(secretsPath);
    
    if (secrets.length === 0) {
      console.log("📭 No secrets found\n");
      return;
    }
    
    console.log("\n📦 Secrets:\n");
    console.table(
      secrets.map((s) => ({
        Name: s.name,
        Created: s.metadata?.createdAt?.split("T")[0] || "Unknown",
        Expires: s.metadata?.expiresAt?.split("T")[0] || "Never",
        Status: s.metadata?.status || "active",
      }))
    );
  } catch (err) {
    logger.error(`Failed to list secrets: ${err}`);
    process.exit(1);
  }
}

/**
 * Command: Add/rotate a secret
 */
async function cmdAddSecret(options: {
  name: string;
  value: string;
  expiresInDays?: number;
  description?: string;
}): Promise<void> {
  const secretsPath = path.join(process.cwd(), "secrets.enc.json");
  const masterKey = getMasterKey();
  
  try {
    const expiresAt = options.expiresInDays
      ? new Date(Date.now() + options.expiresInDays * 24 * 60 * 60 * 1000).toISOString()
      : undefined;
    
    await addSecret(secretsPath, options.name, options.value, masterKey, {
      name: options.name,
      description: options.description,
      createdAt: new Date().toISOString(),
      expiresAt,
      status: "active",
    });
    
    console.log(`✅ Secret '${options.name}' added/updated\n`);
  } catch (err) {
    logger.error(`Failed to add secret: ${err}`);
    process.exit(1);
  }
}

/**
 * Command: Delete a secret
 */
async function cmdDeleteSecret(name: string): Promise<void> {
  const secretsPath = path.join(process.cwd(), "secrets.enc.json");
  
  try {
    await deleteSecret(secretsPath, name);
    console.log(`✅ Secret '${name}' marked for deletion\n`);
  } catch (err) {
    logger.error(`Failed to delete secret: ${err}`);
    process.exit(1);
  }
}

/**
 * Command: View audit log
 */
function cmdAuditLog(options: {
  secret?: string;
  action?: string;
  days?: number;
  limit?: number;
  type?: string;
}): void {
  try {
    if (options.type === "file" || !options.type) {
      // File access logs
      const fileLog = db.prepare(`
        SELECT timestamp, path, action, user, status, error
        FROM file_access_log
        WHERE 1=1
        ${options.days ? `AND timestamp > datetime('now', ? || ' days')` : ""}
        ORDER BY timestamp DESC
        LIMIT ?
      `).all(
        ...(options.days ? [-options.days] : []),
        options.limit || 100
      );
      
      if (fileLog && Array.isArray(fileLog) && fileLog.length > 0) {
        console.log("\n📄 File Access Log:\n");
        console.table(fileLog);
      }
    }
    
    if (options.type === "secret" || !options.type) {
      // Secret access logs
      const secretLog = getSecretAccessLog({
        secret_name: options.secret,
        action: options.action,
        days: options.days,
        limit: options.limit || 100,
      });
      
      if (secretLog && secretLog.length > 0) {
        console.log("\n🔐 Secret Access Log:\n");
        console.table(secretLog);
      } else if (!options.type) {
        console.log("📭 No audit logs found\n");
      }
    }
  } catch (err) {
    logger.error(`Failed to get audit log: ${err}`);
    process.exit(1);
  }
}

/**
 * Command: Rotate secrets
 */
async function cmdRotateSecrets(options: { maxAgeDays?: number }): Promise<void> {
  const secretsPath = path.join(process.cwd(), "secrets.enc.json");
  const maxAge = options.maxAgeDays || config.SECRET_ROTATION_DAYS;
  
  try {
    const expiring = await getExpiringSecrets(secretsPath, maxAge);
    
    if (expiring.length === 0) {
      console.log(`✅ No secrets to rotate (max age: ${maxAge} days)\n`);
      return;
    }
    
    console.log(`\n⚠️  ${expiring.length} secrets nearing rotation (max age: ${maxAge} days):\n`);
    console.table(
      expiring.map((s) => ({
        Secret: s.name,
        "Expires At": s.expiresAt.split("T")[0],
        "Days Left": Math.ceil((new Date(s.expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)),
      }))
    );
    
    console.log("\n💡 To rotate a secret, use:");
    console.log("   npm run secret:add-secret --name <name> --value <new_value>\n");
  } catch (err) {
    logger.error(`Failed to check secrets: ${err}`);
    process.exit(1);
  }
}

/**
 * Command: Cleanup expired secrets
 */
async function cmdCleanup(options: { gracePeriodDays?: number }): Promise<void> {
  const secretsPath = path.join(process.cwd(), "secrets.enc.json");
  const gracePeriod = options.gracePeriodDays || config.SECRET_CLEANUP_DAYS;
  
  try {
    const result = await cleanupExpiredSecrets(secretsPath, gracePeriod);
    
    if (result.cleaned === 0) {
      console.log(`✅ No secrets to cleanup\n`);
      return;
    }
    
    console.log(`\n🧹 Cleaned up ${result.cleaned} deleted secrets:\n`);
    console.log(result.deleted.map((s) => `   • ${s}`).join("\n"));
    console.log();
  } catch (err) {
    logger.error(`Failed to cleanup secrets: ${err}`);
    process.exit(1);
  }
}

/**
 * Command: Export secrets
 */
async function cmdExportSecrets(output: string): Promise<void> {
  const secretsPath = path.join(process.cwd(), "secrets.enc.json");
  
  try {
    const content = await fs.promises.readFile(secretsPath, "utf8");
    const outputPath = path.resolve(output || "secrets-export.json");
    
    await fs.promises.writeFile(outputPath, content, "utf8");
    
    console.log(`✅ Exported secrets to: ${outputPath}\n`);
    console.log("⚠️  This file contains encrypted secrets. Keep it secure!\n");
  } catch (err) {
    logger.error(`Failed to export secrets: ${err}`);
    process.exit(1);
  }
}

/**
 * Command: Import secrets
 */
async function cmdImportSecrets(input: string): Promise<void> {
  const secretsPath = path.join(process.cwd(), "secrets.enc.json");
  const masterKey = getMasterKey();
  
  try {
    const inputPath = path.resolve(input);
    const content = await fs.promises.readFile(inputPath, "utf8");
    const secrets = JSON.parse(content);
    
    // Validate format
    if (typeof secrets !== "object") {
      throw new Error("Invalid secrets file format");
    }
    
    // Save to target location
    await fs.promises.writeFile(secretsPath, content, "utf8");
    
    console.log(`✅ Imported secrets from: ${inputPath}\n`);
    console.log(`📝 Total secrets: ${Object.keys(secrets).length}\n`);
  } catch (err) {
    logger.error(`Failed to import secrets: ${err}`);
    process.exit(1);
  }
}

/**
 * Command: Show security configuration
 */
function cmdShowConfig(): void {
  console.log("\n🔐 Security Configuration:\n");
  console.log({
    "MASTER_KEY Set": !!process.env.MASTER_KEY,
    "SECURITY_AUDIT_ENABLED": config.SECURITY_AUDIT_ENABLED,
    "SECRET_ROTATION_DAYS": config.SECRET_ROTATION_DAYS,
    "SECRET_CLEANUP_DAYS": config.SECRET_CLEANUP_DAYS,
    "SAFE_DIRECTORIES": config.SAFE_DIRECTORIES,
    "FILE_ACCESS_LOG_RETENTION_DAYS": config.FILE_ACCESS_LOG_RETENTION_DAYS,
  });
  console.log();
}

// Setup CLI
program.name("secret-manager");
program.version("1.0.0");
program.description("Gravity Claw Secret Management CLI");

program
  .command("generate-key")
  .alias("generate")
  .description("Generate a new MASTER_KEY")
  .action(cmdGenerateKey);

program
  .command("list")
  .description("List all secrets")
  .action(() => cmdListSecrets().catch(console.error));

program
  .command("add-secret")
  .option("--name <name>", "Secret name")
  .option("--value <value>", "Secret value")
  .option("--expires-in-days <days>", "Expiration in days", (val) => parseInt(val, 10))
  .option("--description <desc>", "Secret description")
  .action((opts) => {
    if (!opts.name || !opts.value) {
      console.error("❌ --name and --value are required\n");
      process.exit(1);
    }
    cmdAddSecret({
      name: opts.name,
      value: opts.value,
      expiresInDays: opts.expiresInDays,
      description: opts.description,
    }).catch(console.error);
  });

program
  .command("delete-secret <name>")
  .description("Delete a secret (soft delete)")
  .action((name) => cmdDeleteSecret(name).catch(console.error));

program
  .command("audit")
  .option("--secret <name>", "Filter by secret name")
  .option("--action <action>", "Filter by action (read/write/rotate/delete)")
  .option("--days <days>", "Show last N days", (val) => parseInt(val, 10))
  .option("--limit <limit>", "Max results", (val) => parseInt(val, 10))
  .option("--type <type>", "Log type (secret/file/all)")
  .description("View audit logs")
  .action((opts) => cmdAuditLog(opts));

program
  .command("rotate")
  .option("--max-age-days <days>", "Max age in days", (val) => parseInt(val, 10))
  .description("Check secrets for rotation")
  .action((opts) => cmdRotateSecrets(opts).catch(console.error));

program
  .command("cleanup")
  .option("--grace-period-days <days>", "Grace period in days", (val) => parseInt(val, 10))
  .description("Cleanup deleted secrets")
  .action((opts) => cmdCleanup(opts).catch(console.error));

program
  .command("export")
  .option("--output <file>", "Output file (default: secrets-export.json)")
  .description("Export all secrets")
  .action((opts) => cmdExportSecrets(opts.output).catch(console.error));

program
  .command("import <input>")
  .description("Import encrypted secrets")
  .action((input) => cmdImportSecrets(input).catch(console.error));

program
  .command("show-config")
  .description("Show security configuration")
  .action(cmdShowConfig);

program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
