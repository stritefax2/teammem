import { describe, it, expect, beforeAll } from "vitest";

// Vitest doesn't share env between test files, so set this before the module
// under test is imported.
beforeAll(() => {
  if (!process.env.CONNECTOR_ENCRYPTION_KEY) {
    // 32 bytes of zeros, base64-encoded — fine for unit tests.
    process.env.CONNECTOR_ENCRYPTION_KEY = Buffer.alloc(32).toString("base64");
  }
});

describe("crypto.encryptConfig / decryptConfig", () => {
  it("round-trips a plaintext value", async () => {
    const { encryptConfig, decryptConfig } = await import("./crypto.js");
    const plaintext =
      "postgres://user:p@ssword@db.example.com:5432/app?sslmode=require";
    const packed = encryptConfig(plaintext);
    expect(packed.startsWith("v1:")).toBe(true);
    expect(packed).not.toContain("password");
    expect(decryptConfig(packed)).toBe(plaintext);
  });

  it("produces distinct ciphertexts for the same plaintext", async () => {
    const { encryptConfig } = await import("./crypto.js");
    const a = encryptConfig("same input");
    const b = encryptConfig("same input");
    expect(a).not.toBe(b);
  });

  it("rejects an unknown version prefix", async () => {
    const { decryptConfig } = await import("./crypto.js");
    expect(() => decryptConfig("v9:" + Buffer.alloc(30).toString("base64"))).toThrow(
      /version/i
    );
  });

  it("rejects tampered ciphertext", async () => {
    const { encryptConfig, decryptConfig } = await import("./crypto.js");
    const packed = encryptConfig("sensitive");
    // Flip a byte in the ciphertext portion.
    const body = Buffer.from(packed.slice(3), "base64");
    body[body.length - 1] ^= 0x01;
    const tampered = "v1:" + body.toString("base64");
    expect(() => decryptConfig(tampered)).toThrow();
  });

  it("rejects a malformed packed blob", async () => {
    const { decryptConfig } = await import("./crypto.js");
    expect(() => decryptConfig("v1:abc")).toThrow(/malformed/);
  });
});
