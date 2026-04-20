import crypto from "node:crypto";

// AES-256-GCM wrap/unwrap for connector credentials.
//
// The key is read from CONNECTOR_ENCRYPTION_KEY (base64 or hex 32 bytes).
// This is explicitly v1 — proper secrets management (KMS, Vault, etc.) is
// a v2 concern. The important invariants for now:
//   1. Plaintext credentials are never persisted to disk.
//   2. Ciphertext alone (what we store) cannot be decrypted without the
//      process-level secret.
//   3. Rotation story: rotate CONNECTOR_ENCRYPTION_KEY + re-encrypt all
//      data_sources rows (not implemented yet).

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.CONNECTOR_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "CONNECTOR_ENCRYPTION_KEY is not set. Generate with " +
        "`openssl rand -base64 32` and add to your API env."
    );
  }
  // Accept either base64 (44 chars) or hex (64 chars)
  let buf: Buffer;
  if (/^[A-Fa-f0-9]{64}$/.test(raw)) {
    buf = Buffer.from(raw, "hex");
  } else {
    buf = Buffer.from(raw, "base64");
  }
  if (buf.length !== 32) {
    throw new Error(
      `CONNECTOR_ENCRYPTION_KEY must decode to exactly 32 bytes (got ${buf.length})`
    );
  }
  cachedKey = buf;
  return buf;
}

export function encryptConfig(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  // Packed format: base64(iv || authTag || ciphertext), versioned with a
  // "v1:" prefix for future algorithm rotation.
  return `v1:${Buffer.concat([iv, authTag, ciphertext]).toString("base64")}`;
}

export function decryptConfig(packed: string): string {
  if (!packed.startsWith("v1:")) {
    throw new Error("Unknown encrypted_config version");
  }
  const buf = Buffer.from(packed.slice(3), "base64");
  if (buf.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error("encrypted_config malformed");
  }
  const iv = buf.subarray(0, IV_LENGTH);
  const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

// For startup validation — fail fast if the env is misconfigured.
export function assertEncryptionKeyPresent(): void {
  getKey();
}
