import { describe, expect, it } from "vitest";

import { decryptSecret, encryptSecret, parseEncryptionKey } from "./crypto.js";

const KEY = parseEncryptionKey(Buffer.from("a".repeat(32)).toString("base64"));

describe("encryptSecret / decryptSecret", () => {
	it("round-trips plaintext", () => {
		const plain = "sk-test-supersecret";
		const cipher = encryptSecret(plain, KEY);
		expect(decryptSecret(cipher, KEY)).toBe(plain);
	});

	it("produces different ciphertext each call (random IV)", () => {
		const a = encryptSecret("hello", KEY);
		const b = encryptSecret("hello", KEY);
		expect(a).not.toBe(b);
	});

	it("throws on tampered ciphertext", () => {
		const cipher = encryptSecret("test", KEY);
		const tampered = cipher.slice(0, -2) + "ff";
		expect(() => decryptSecret(tampered, KEY)).toThrow();
	});

	it("throws on ciphertext that is too short", () => {
		expect(() => decryptSecret("deadbeef", KEY)).toThrow("too short");
	});
});

describe("parseEncryptionKey", () => {
	it("accepts a valid 32-byte base64 key", () => {
		const key = parseEncryptionKey(
			Buffer.from("b".repeat(32)).toString("base64"),
		);
		expect(key.length).toBe(32);
	});

	it("throws when key is not 32 bytes", () => {
		const short = Buffer.from("x".repeat(16)).toString("base64");
		expect(() => parseEncryptionKey(short)).toThrow("32 bytes");
	});
});
