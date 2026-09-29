import { randomBytes } from 'node:crypto';
import { decrypt, encrypt, generateToken, sha256 } from './crypto.util';

describe('crypto.util', () => {
  const key = randomBytes(32).toString('base64');

  it('round-trips encrypt/decrypt', () => {
    const secret = 'sk-test-1234567890';
    expect(decrypt(encrypt(secret, key), key)).toBe(secret);
  });

  it('produces a different ciphertext for the same input (random IV)', () => {
    expect(encrypt('same', key)).not.toBe(encrypt('same', key));
  });

  it('rejects tampered ciphertext', () => {
    const [iv, tag, data] = encrypt('secret', key).split('.');
    const tampered = Buffer.from(data, 'base64');
    tampered[0] ^= 0xff;
    expect(() => decrypt([iv, tag, tampered.toString('base64')].join('.'), key)).toThrow();
  });

  it('rejects decryption with the wrong key', () => {
    const otherKey = randomBytes(32).toString('base64');
    expect(() => decrypt(encrypt('secret', key), otherKey)).toThrow();
  });

  it('hashes deterministically and generates url-safe tokens', () => {
    expect(sha256('abc')).toHaveLength(64);
    expect(sha256('abc')).toBe(sha256('abc'));
    expect(generateToken()).toMatch(/^[\w-]{43}$/);
  });
});
