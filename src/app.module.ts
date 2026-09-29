import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { SecurityModule } from './common/security/security.module';
import configuration, { AppConfig } from './config/configuration';
import { envValidationSchema } from './config/env.validation';
import { AdminModule } from './modules/admin/admin.module';
import { AiProvidersModule } from './modules/ai-providers/ai-providers.module';
import { AuthModule } from './modules/auth/auth.module';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from './modules/auth/guards/roles.guard';
import { ChatModule } from './modules/chat/chat.module';
import { HealthModule } from './modules/health/health.module';
import { RequestLoggingMiddleware } from './modules/request-logs/request-logging.middleware';
import { RequestLogsModule } from './modules/request-logs/request-logs.module';
import { SearchModule } from './modules/search/search.module';
import { SessionsModule } from './modules/sessions/sessions.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { UsersModule } from './modules/users/users.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [configuration],
      validationSchema: envValidationSchema,
      validationOptions: { abortEarly: false },
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => {
        const { throttleTtlSeconds, throttleLimit } = config.get('security', { infer: true });
        return [{ ttl: throttleTtlSeconds * 1000, limit: throttleLimit }];
      },
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    SecurityModule,
    RequestLogsModule,
    HealthModule,
    AuthModule,
    SessionsModule,
    UsersModule,
    SubscriptionsModule,
    AiProvidersModule,
    ChatModule,
    SearchModule,
    AdminModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // Guards run in registration order: rate limit -> authenticate -> authorize.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware, RequestLoggingMiddleware).forRoutes('*path');
  }
}
