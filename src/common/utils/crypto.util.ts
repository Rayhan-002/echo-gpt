import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const CIPHER = 'aes-256-gcm';
const IV_BYTES = 12;

/** Hex encoded SHA-256 digest. Used to store bearer secrets (refresh/verification tokens). */
export const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

/** URL-safe random token with `bytes` bytes of entropy. */
export const generateToken = (bytes = 32): string => randomBytes(bytes).toString('base64url');

/**
 * Encrypts `plaintext` with AES-256-GCM. Output format: `iv.authTag.ciphertext` (base64 parts).
 * A fresh random IV is used per call so equal inputs produce different ciphertexts.
 */
export const encrypt = (plaintext: string, base64Key: string): string => {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(CIPHER, Buffer.from(base64Key, 'base64'), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString('base64')).join('.');
};

/** Reverses {@link encrypt}. Throws if the payload was tampered with or the key is wrong. */
export const decrypt = (payload: string, base64Key: string): string => {
  const [iv, authTag, ciphertext] = payload.split('.').map((part) => Buffer.from(part, 'base64'));
  if (!iv || !authTag || !ciphertext) {
    throw new Error('Malformed encrypted payload');
  }
  const decipher = createDecipheriv(CIPHER, Buffer.from(base64Key, 'base64'), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
};
