import { describe, it, expect } from "vitest";
import { verifyBackup } from "../backup/verify.ts";
import { writeFileSync, mkdtempSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("Backup verification", () => {
  it("detects missing files", () => {
    const result = verifyBackup("/nonexistent/path.tar.gz");
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("File does not exist");
  });

  it("validates existing files", () => {
    const dir = mkdtempSync(join(tmpdir(), "backup-test-"));
    const file = join(dir, "test.txt");
    writeFileSync(file, "hello world");

    const result = verifyBackup(file);
    expect(result.valid).toBe(true);
    expect(result.size).toBe(11);
    expect(result.errors).toEqual([]);
  });

  it("detects size mismatch", () => {
    const dir = mkdtempSync(join(tmpdir(), "backup-test-"));
    const file = join(dir, "test.txt");
    writeFileSync(file, "hello world");

    const result = verifyBackup(file, { expectedSize: 999, expectedHash: "" });
    expect(result.sizeMatch).toBe(false);
    expect(result.valid).toBe(false);
  });

  it("detects hash mismatch", () => {
    const dir = mkdtempSync(join(tmpdir(), "backup-test-"));
    const file = join(dir, "test.txt");
    writeFileSync(file, "hello world");

    const result = verifyBackup(file, { expectedSize: 11, expectedHash: "0000" });
    expect(result.hashMatch).toBe(false);
    expect(result.valid).toBe(false);
  });
});
