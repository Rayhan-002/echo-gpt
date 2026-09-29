import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../config/configuration';
import { decrypt, encrypt } from '../utils/crypto.util';

/** Symmetric encryption for secrets stored at rest (e.g. AI provider API keys). */
@Injectable()
export class EncryptionService {
  private readonly key: string;

  constructor(config: ConfigService<AppConfig, true>) {
    this.key = config.get('security.encryptionKey', { infer: true });
  }

  encrypt(plaintext: string): string {
    return encrypt(plaintext, this.key);
  }

  decrypt(payload: string): string {
    return decrypt(payload, this.key);
  }
}
