import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  generateMasterKey,
  encryptSecret,
  decryptSecret,
  addSecret,
  removeSecret,
  listSecrets,
  loadSecretsFile,
  saveSecretsFile,
  decryptAllSecrets,
  type EncryptedData,
} from "../secrets.ts";
import { writeFile, unlink, access } from "fs/promises";
import { resolve } from "path";

describe("Encrypted Secrets", () => {
  const testSecretsFile = resolve("test-secrets.enc.json");
  const testMasterKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  
  afterEach(async () => {
    // Clean up test file
    try {
      await unlink(testSecretsFile);
    } catch {
      // Ignore if file doesn't exist
    }
  });
  
  describe("generateMasterKey", () => {
    it("should generate a 64-character hex string", () => {
      const key = generateMasterKey();
      expect(key).toMatch(/^[0-9a-f]{64}$/);
    });
    
    it("should generate unique keys", () => {
      const key1 = generateMasterKey();
      const key2 = generateMasterKey();
      expect(key1).not.toBe(key2);
    });
  });
  
  describe("encryptSecret and decryptSecret", () => {
    it("should encrypt and decrypt a simple string", () => {
      const plaintext = "my-secret-api-key";
      const encrypted = encryptSecret(plaintext, testMasterKey);
      
      expect(encrypted.iv).toMatch(/^[0-9a-f]+$/);
      expect(encrypted.data).toMatch(/^[0-9a-f]+$/);
      expect(encrypted.authTag).toMatch(/^[0-9a-f]+$/);
      
      const decrypted = decryptSecret(encrypted, testMasterKey);
      expect(decrypted).toBe(plaintext);
    });
    
    it("should encrypt and decrypt long strings", () => {
      const plaintext = "a".repeat(10000);
      const encrypted = encryptSecret(plaintext, testMasterKey);
      const decrypted = decryptSecret(encrypted, testMasterKey);
      expect(decrypted).toBe(plaintext);
    });
    
    it("should encrypt and decrypt special characters", () => {
      const plaintext = "🔐 secret! @#$%^&*() 日本語 emoji 🎉";
      const encrypted = encryptSecret(plaintext, testMasterKey);
      const decrypted = decryptSecret(encrypted, testMasterKey);
      expect(decrypted).toBe(plaintext);
    });
    
    it("should produce different ciphertexts for same plaintext", () => {
      const plaintext = "same-secret";
      const encrypted1 = encryptSecret(plaintext, testMasterKey);
      const encrypted2 = encryptSecret(plaintext, testMasterKey);
      
      // IVs should be different
      expect(encrypted1.iv).not.toBe(encrypted2.iv);
      // Ciphertexts should be different
      expect(encrypted1.data).not.toBe(encrypted2.data);
      
      // Both should decrypt to same plaintext
      expect(decryptSecret(encrypted1, testMasterKey)).toBe(plaintext);
      expect(decryptSecret(encrypted2, testMasterKey)).toBe(plaintext);
    });
    
    it("should fail decryption with wrong key", () => {
      const plaintext = "secret";
      const encrypted = encryptSecret(plaintext, testMasterKey);
      const wrongKey = "wrong-key-1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
      
      expect(() => decryptSecret(encrypted, wrongKey)).toThrow("Decryption failed");
    });
    
    it("should fail decryption with tampered data", () => {
      const plaintext = "secret";
      const encrypted = encryptSecret(plaintext, testMasterKey);
      
      // Tamper with data
      const tampered = { ...encrypted, data: "0".repeat(encrypted.data.length) };
      
      expect(() => decryptSecret(tampered, testMasterKey)).toThrow("Decryption failed");
    });
    
    it("should fail decryption with tampered authTag", () => {
      const plaintext = "secret";
      const encrypted = encryptSecret(plaintext, testMasterKey);
      
      // Tamper with auth tag
      const tampered = { ...encrypted, authTag: "0".repeat(encrypted.authTag.length) };
      
      expect(() => decryptSecret(tampered, testMasterKey)).toThrow("Decryption failed");
    });
    
    it("should throw error when encrypting empty string", () => {
      expect(() => encryptSecret("", testMasterKey)).toThrow("Plaintext cannot be empty");
    });
    
    it("should throw error when master key is missing", () => {
      expect(() => encryptSecret("secret", "")).toThrow("Master key is required");
      expect(() => decryptSecret({ iv: "a", data: "b", authTag: "c" }, "")).toThrow("Master key is required");
    });
    
    it("should work with non-hex master keys", () => {
      const plaintext = "secret";
      const key = "my-password-123";
      
      const encrypted = encryptSecret(plaintext, key);
      const decrypted = decryptSecret(encrypted, key);
      
      expect(decrypted).toBe(plaintext);
    });
  });
  
  describe("loadSecretsFile and saveSecretsFile", () => {
    it("should save and load secrets file", async () => {
      const secrets = new Map<string, EncryptedData>();
      secrets.set("API_KEY_1", encryptSecret("value1", testMasterKey));
      secrets.set("API_KEY_2", encryptSecret("value2", testMasterKey));
      
      await saveSecretsFile(testSecretsFile, secrets);
      
      const loaded = await loadSecretsFile(testSecretsFile);
      expect(loaded.size).toBe(2);
      expect(loaded.has("API_KEY_1")).toBe(true);
      expect(loaded.has("API_KEY_2")).toBe(true);
    });
    
    it("should return empty map for non-existent file", async () => {
      const loaded = await loadSecretsFile("non-existent-file.json");
      expect(loaded.size).toBe(0);
    });
    
    it("should handle empty secrets file", async () => {
      await saveSecretsFile(testSecretsFile, new Map());
      const loaded = await loadSecretsFile(testSecretsFile);
      expect(loaded.size).toBe(0);
    });
  });
  
  describe("addSecret", () => {
    it("should add a new secret to file", async () => {
      await addSecret(testSecretsFile, "TEST_KEY", "test-value", testMasterKey);
      
      const secrets = await loadSecretsFile(testSecretsFile);
      expect(secrets.has("TEST_KEY")).toBe(true);
      
      const encrypted = secrets.get("TEST_KEY")!;
      const decrypted = decryptSecret(encrypted, testMasterKey);
      expect(decrypted).toBe("test-value");
    });
    
    it("should update existing secret", async () => {
      await addSecret(testSecretsFile, "KEY", "value1", testMasterKey);
      await addSecret(testSecretsFile, "KEY", "value2", testMasterKey);
      
      const secrets = await loadSecretsFile(testSecretsFile);
      expect(secrets.size).toBe(1);
      
      const encrypted = secrets.get("KEY")!;
      const decrypted = decryptSecret(encrypted, testMasterKey);
      expect(decrypted).toBe("value2");
    });
    
    it("should store metadata", async () => {
      const metadata = {
        name: "MY_KEY",
        description: "Test API key",
        createdAt: "2026-03-01T00:00:00Z",
      };
      
      await addSecret(testSecretsFile, "MY_KEY", "value", testMasterKey, metadata);
      
      const secrets = await loadSecretsFile(testSecretsFile);
      const encrypted = secrets.get("MY_KEY")!;
      
      expect(encrypted.metadata).toEqual(metadata);
    });
  });
  
  describe("removeSecret", () => {
    it("should remove a secret from file", async () => {
      await addSecret(testSecretsFile, "KEY1", "value1", testMasterKey);
      await addSecret(testSecretsFile, "KEY2", "value2", testMasterKey);
      
      await removeSecret(testSecretsFile, "KEY1");
      
      const secrets = await loadSecretsFile(testSecretsFile);
      expect(secrets.size).toBe(1);
      expect(secrets.has("KEY1")).toBe(false);
      expect(secrets.has("KEY2")).toBe(true);
    });
    
    it("should throw error when removing non-existent secret", async () => {
      await expect(removeSecret(testSecretsFile, "NONEXISTENT")).rejects.toThrow("not found");
    });
  });
  
  describe("listSecrets", () => {
    it("should list all secret names", async () => {
      await addSecret(testSecretsFile, "KEY1", "value1", testMasterKey, {
        description: "First key",
      });
      await addSecret(testSecretsFile, "KEY2", "value2", testMasterKey, {
        description: "Second key",
      });
      
      const list = await listSecrets(testSecretsFile);
      expect(list).toHaveLength(2);
      expect(list.map(s => s.name)).toEqual(expect.arrayContaining(["KEY1", "KEY2"]));
      expect(list[0]?.metadata?.description).toBeDefined();
    });
    
    it("should return empty array for non-existent file", async () => {
      const list = await listSecrets("non-existent-file.json");
      expect(list).toHaveLength(0);
    });
  });
  
  describe("decryptAllSecrets", () => {
    it("should decrypt all secrets in file", async () => {
      await addSecret(testSecretsFile, "KEY1", "value1", testMasterKey);
      await addSecret(testSecretsFile, "KEY2", "value2", testMasterKey);
      await addSecret(testSecretsFile, "KEY3", "value3", testMasterKey);
      
      const decrypted = await decryptAllSecrets(testSecretsFile, testMasterKey);
      
      expect(decrypted.size).toBe(3);
      expect(decrypted.get("KEY1")).toBe("value1");
      expect(decrypted.get("KEY2")).toBe("value2");
      expect(decrypted.get("KEY3")).toBe("value3");
    });
    
    it("should throw error if any secret fails to decrypt", async () => {
      await addSecret(testSecretsFile, "KEY1", "value1", testMasterKey);
      await addSecret(testSecretsFile, "KEY2", "value2", testMasterKey);
      
      const wrongKey = "wrong-key";
      
      await expect(decryptAllSecrets(testSecretsFile, wrongKey)).rejects.toThrow("Failed to decrypt secret");
    });
  });
  
  describe("Security Properties", () => {
    it("should use different IVs for each encryption", () => {
      const plaintext = "same-text";
      const enc1 = encryptSecret(plaintext, testMasterKey);
      const enc2 = encryptSecret(plaintext, testMasterKey);
      const enc3 = encryptSecret(plaintext, testMasterKey);
      
      expect(enc1.iv).not.toBe(enc2.iv);
      expect(enc2.iv).not.toBe(enc3.iv);
      expect(enc1.iv).not.toBe(enc3.iv);
    });
    
    it("should detect tampered ciphertext", () => {
      const encrypted = encryptSecret("secret", testMasterKey);
      
      // Flip a bit in ciphertext
      const dataBuffer = Buffer.from(encrypted.data, "hex");
      dataBuffer[0] = dataBuffer[0]! ^ 1;
      const tampered = { ...encrypted, data: dataBuffer.toString("hex") };
      
      expect(() => decryptSecret(tampered, testMasterKey)).toThrow();
    });
    
    it("should prevent replay attacks via auth tag verification", () => {
      const enc1 = encryptSecret("secret1", testMasterKey);
      const enc2 = encryptSecret("secret2", testMasterKey);
      
      // Try to use enc2's auth tag with enc1's data
      const mixed = { ...enc1, authTag: enc2.authTag };
      
      expect(() => decryptSecret(mixed, testMasterKey)).toThrow();
    });
  });
});
