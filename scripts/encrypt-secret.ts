#!/usr/bin/env node
/**
 * Encrypted Secrets CLI Tool
 * 
 * Manage encrypted secrets in secrets.enc.json
 * 
 * Usage:
 *   Generate master key:
 *     node scripts/encrypt-secret.ts --generate-key
 * 
 *   Encrypt a secret:
 *     node scripts/encrypt-secret.ts --encrypt "my-secret-value"
 *     node scripts/encrypt-secret.ts --encrypt "my-secret-value" --name MY_API_KEY
 * 
 *   Add secret to file:
 *     node scripts/encrypt-secret.ts --add MY_API_KEY "my-secret-value"
 * 
 *   Decrypt a secret:
 *     node scripts/encrypt-secret.ts --decrypt '{"iv":"...","data":"...","authTag":"..."}'
 * 
 *   List secrets:
 *     node scripts/encrypt-secret.ts --list
 * 
 *   Remove secret:
 *     node scripts/encrypt-secret.ts --remove MY_API_KEY
 * 
 *   View secret value:
 *     node scripts/encrypt-secret.ts --view MY_API_KEY
 */

import { resolve } from "path";
import { createInterface } from "readline";
import {
  generateMasterKey,
  encryptSecret,
  decryptSecret,
  addSecret,
  removeSecret,
  listSecrets,
  loadSecretsFile,
  type EncryptedData,
} from "../src/secrets.js";

const SECRETS_FILE = resolve("secrets.enc.json");

/**
 * Read master key from environment or prompt
 */
async function getMasterKey(): Promise<string> {
  const envKey = process.env.MASTER_KEY;
  if (envKey) {
    return envKey;
  }
  
  console.error("⚠️  MASTER_KEY not found in environment");
  console.error("Please set MASTER_KEY in your .env file or export it:");
  console.error("  export MASTER_KEY=<your-key>");
  console.error("");
  console.error("Or generate a new key with: --generate-key");
  
  process.exit(1);
}

/**
 * Prompt for user input (for interactive mode)
 */
async function prompt(question: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

/**
 * Main CLI function
 */
async function main() {
  const args = process.argv.slice(2);
  
  // Parse command
  const command = args[0];
  
  try {
    if (command === "--generate-key" || command === "-g") {
      // Generate a new master key
      const key = generateMasterKey();
      console.log("✅ Generated new master key:");
      console.log("");
      console.log(key);
      console.log("");
      console.log("Add this to your .env file:");
      console.log(`MASTER_KEY=${key}`);
      console.log("");
      console.log("⚠️  Keep this key safe! Anyone with this key can decrypt your secrets.");
      return;
    }
    
    if (command === "--encrypt" || command === "-e") {
      // Encrypt a secret (output JSON, don't save to file)
      const plaintext = args[1];
      if (!plaintext) {
        console.error("❌ Error: Missing secret value");
        console.error("Usage: --encrypt <value>");
        process.exit(1);
      }
      
      const masterKey = await getMasterKey();
      const encrypted = encryptSecret(plaintext, masterKey);
      
      console.log("✅ Encrypted secret:");
      console.log("");
      console.log(JSON.stringify(encrypted, null, 2));
      console.log("");
      console.log("Copy this JSON to secrets.enc.json manually, or use --add to save directly.");
      return;
    }
    
    if (command === "--decrypt" || command === "-d") {
      // Decrypt a secret from JSON
      const encryptedJson = args[1];
      if (!encryptedJson) {
        console.error("❌ Error: Missing encrypted JSON");
        console.error("Usage: --decrypt '<json>'");
        process.exit(1);
      }
      
      const masterKey = await getMasterKey();
      const encrypted = JSON.parse(encryptedJson) as EncryptedData;
      const decrypted = decryptSecret(encrypted, masterKey);
      
      console.log("✅ Decrypted secret:");
      console.log("");
      console.log(decrypted);
      return;
    }
    
    if (command === "--add" || command === "-a") {
      // Add a secret to secrets.enc.json
      const name = args[1];
      const value = args[2];
      
      if (!name || !value) {
        console.error("❌ Error: Missing name or value");
        console.error("Usage: --add <name> <value>");
        console.error("Example: --add MY_API_KEY 'sk-1234567890'");
        process.exit(1);
      }
      
      const masterKey = await getMasterKey();
      
      // Optional description
      const description = args.includes("--desc") 
        ? args[args.indexOf("--desc") + 1] 
        : undefined;
      
      await addSecret(SECRETS_FILE, name, value, masterKey, {
        name,
        description,
        createdAt: new Date().toISOString(),
      });
      
      console.log(`✅ Secret '${name}' added to ${SECRETS_FILE}`);
      return;
    }
    
    if (command === "--remove" || command === "-r") {
      // Remove a secret from secrets.enc.json
      const name = args[1];
      
      if (!name) {
        console.error("❌ Error: Missing secret name");
        console.error("Usage: --remove <name>");
        process.exit(1);
      }
      
      await removeSecret(SECRETS_FILE, name);
      console.log(`✅ Secret '${name}' removed from ${SECRETS_FILE}`);
      return;
    }
    
    if (command === "--list" || command === "-l") {
      // List all secrets (names only, not values)
      const secrets = await listSecrets(SECRETS_FILE);
      
      if (secrets.length === 0) {
        console.log(`No secrets found in ${SECRETS_FILE}`);
        return;
      }
      
      console.log(`📋 Secrets in ${SECRETS_FILE}:`);
      console.log("");
      
      for (const secret of secrets) {
        console.log(`  • ${secret.name}`);
        if (secret.metadata?.description) {
          console.log(`    ${secret.metadata.description}`);
        }
        if (secret.metadata?.createdAt) {
          console.log(`    Created: ${secret.metadata.createdAt}`);
        }
        console.log("");
      }
      
      return;
    }
    
    if (command === "--view" || command === "-v") {
      // View a decrypted secret value
      const name = args[1];
      
      if (!name) {
        console.error("❌ Error: Missing secret name");
        console.error("Usage: --view <name>");
        process.exit(1);
      }
      
      const masterKey = await getMasterKey();
      const secrets = await loadSecretsFile(SECRETS_FILE);
      const encrypted = secrets.get(name);
      
      if (!encrypted) {
        console.error(`❌ Error: Secret '${name}' not found`);
        process.exit(1);
      }
      
      const decrypted = decryptSecret(encrypted, masterKey);
      console.log(`🔑 Secret '${name}':`);
      console.log("");
      console.log(decrypted);
      return;
    }
    
    // No command or unknown command - show help
    console.log("Encrypted Secrets CLI");
    console.log("");
    console.log("Usage:");
    console.log("  --generate-key, -g           Generate a new master key");
    console.log("  --encrypt <value>, -e        Encrypt a value (output JSON)");
    console.log("  --decrypt <json>, -d         Decrypt a JSON string");
    console.log("  --add <name> <value>, -a     Add secret to file");
    console.log("  --remove <name>, -r          Remove secret from file");
    console.log("  --list, -l                   List all secret names");
    console.log("  --view <name>, -v            View decrypted secret value");
    console.log("");
    console.log("Examples:");
    console.log("  node scripts/encrypt-secret.ts --generate-key");
    console.log("  node scripts/encrypt-secret.ts --add MY_API_KEY 'sk-123456'");
    console.log("  node scripts/encrypt-secret.ts --list");
    console.log("  node scripts/encrypt-secret.ts --view MY_API_KEY");
    console.log("");
    console.log("Environment:");
    console.log("  MASTER_KEY must be set in .env or environment");
    
  } catch (err) {
    console.error(`❌ Error: ${(err as Error).message}`);
    process.exit(1);
  }
}

// Run CLI
main().catch((err) => {
  console.error("❌ Fatal error:", err);
  process.exit(1);
});
