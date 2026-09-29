import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

/**
 * Password hashing with Argon2id (OWASP recommended). Parameters are encoded
 * in the hash itself, so they can be tuned later without breaking old hashes.
 */
@Injectable()
export class PasswordService {
  /** Pre-computed hash used to equalize timing when the user does not exist. */
  private readonly dummyHash = argon2.hash('echogpt-timing-equalizer', { type: argon2.argon2id });

  hash(plain: string): Promise<string> {
    return argon2.hash(plain, { type: argon2.argon2id });
  }

  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  }

  /**
   * Burns roughly the same CPU time as a real verification so login responses
   * don't reveal whether an email is registered.
   */
  async verifyDummy(plain: string): Promise<false> {
    await this.verify(await this.dummyHash, plain);
    return false;
  }
}
