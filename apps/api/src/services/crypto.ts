import crypto from "node:crypto";
import { env } from "../env.js";

/**
 * AES-256-GCM encryption for secrets we store on a user's behalf (their Notion
 * token, Anthropic key, GitHub token). BYOK means we hold other people's keys —
 * so they must be encrypted at rest, never plaintext in the DB.
 *
 * Format (base64): [12-byte IV][16-byte auth tag][ciphertext].
 * The master key comes from env (MASTER_KEY, 32 bytes hex) — in production it
 * would come from a KMS / secret manager, never from source.
 */

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

function masterKey(): Buffer {
  const hex = env.masterKey;
  if (!hex) throw new Error("MASTER_KEY is not set — cannot encrypt/decrypt stored credentials.");
  const key = Buffer.from(hex, "hex");
  if (key.length !== 32) throw new Error("MASTER_KEY must be 32 bytes (64 hex chars).");
  return key;
}

/** Encrypt a UTF-8 string. Returns base64(iv|tag|ciphertext). */
export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, masterKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

/** Decrypt a value produced by encryptSecret. Throws if tampered (GCM auth). */
export function decryptSecret(payload: string): string {
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const enc = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGO, masterKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

/** Generate a 32-byte hex master key (for `.env` / key rotation tooling). */
export function generateMasterKey(): string {
  return crypto.randomBytes(32).toString("hex");
}
