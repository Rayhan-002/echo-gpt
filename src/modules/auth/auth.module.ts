import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AppConfig } from '../../config/configuration';
import { MailModule } from '../mail/mail.module';
import { SessionsModule } from '../sessions/sessions.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { VerificationTokensService } from './verification-tokens.service';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => {
        const auth = config.get('auth', { infer: true });
        return {
          secret: auth.accessSecret,
          signOptions: { algorithm: 'HS256', expiresIn: auth.accessTtlSeconds },
        };
      },
    }),
    UsersModule,
    SessionsModule,
    MailModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, VerificationTokensService, JwtStrategy],
})
export class AuthModule {}
