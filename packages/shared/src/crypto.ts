import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

export function encryptSecret(plaintext: string, key: Buffer): string {
	const iv = randomBytes(IV_LENGTH);
	const cipher = createCipheriv(ALGORITHM, key, iv);
	const encrypted = Buffer.concat([
		cipher.update(plaintext, "utf8"),
		cipher.final(),
	]);
	const tag = cipher.getAuthTag();
	// Layout: iv(12) + tag(16) + ciphertext — all hex-encoded
	return Buffer.concat([iv, tag, encrypted]).toString("hex");
}

export function decryptSecret(ciphertext: string, key: Buffer): string {
	const buf = Buffer.from(ciphertext, "hex");
	if (buf.length < IV_LENGTH + TAG_LENGTH) {
		throw new Error("Invalid ciphertext: too short");
	}
	const iv = buf.subarray(0, IV_LENGTH);
	const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
	const encrypted = buf.subarray(IV_LENGTH + TAG_LENGTH);
	const decipher = createDecipheriv(ALGORITHM, key, iv);
	decipher.setAuthTag(tag);
	return decipher.update(encrypted).toString("utf8") + decipher.final("utf8");
}

export function parseEncryptionKey(base64Key: string): Buffer {
	const key = Buffer.from(base64Key, "base64");
	if (key.length !== 32) {
		throw new Error(
			`Encryption key must be 32 bytes (got ${key.length}). Generate with: openssl rand -base64 32`,
		);
	}
	return key;
}
