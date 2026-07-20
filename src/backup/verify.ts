import { createHash } from "crypto";
import { statSync, readFileSync, existsSync } from "fs";

export interface VerificationResult {
  valid: boolean;
  path: string;
  size: number;
  sizeMatch: boolean;
  hashMatch: boolean;
  errors: string[];
}

export function verifyBackup(backupPath: string, metadata?: { expectedSize: number; expectedHash: string }): VerificationResult {
  const errors: string[] = [];

  if (!existsSync(backupPath)) {
    return { valid: false, path: backupPath, size: 0, sizeMatch: false, hashMatch: false, errors: ["File does not exist"] };
  }

  let size = 0;
  try {
    size = statSync(backupPath).size;
  } catch (err) {
    errors.push(`Cannot stat file: ${err}`);
    return { valid: false, path: backupPath, size: 0, sizeMatch: false, hashMatch: false, errors };
  }

  const sizeMatch = metadata ? size === metadata.expectedSize : true;
  if (metadata && !sizeMatch) {
    errors.push(`Size mismatch: expected ${metadata.expectedSize}, got ${size}`);
  }

  let hash = "";
  try {
    const data = readFileSync(backupPath);
    hash = createHash("sha256").update(data).digest("hex");
  } catch (err) {
    errors.push(`Cannot read file: ${err}`);
    return { valid: false, path: backupPath, size, sizeMatch, hashMatch: false, errors };
  }

  const hashMatch = metadata ? hash === metadata.expectedHash : true;
  if (metadata && !hashMatch) {
    errors.push(`Hash mismatch: expected ${metadata.expectedHash}, got ${hash}`);
  }

  const valid = errors.length === 0;
  return { valid, path: backupPath, size, sizeMatch, hashMatch, errors };
}
