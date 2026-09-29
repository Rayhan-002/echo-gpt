import { Global, Module } from '@nestjs/common';
import { EncryptionService } from './encryption.service';
import { PasswordService } from './password.service';

@Global()
@Module({
  providers: [PasswordService, EncryptionService],
  exports: [PasswordService, EncryptionService],
})
export class SecurityModule {}
