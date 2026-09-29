import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppConfig } from './config/configuration';

/**
 * Applies the HTTP pipeline shared by the server, the e2e tests and the OpenAPI
 * export, so all three see exactly the same routes and behavior.
 */
export function configureApp(app: NestExpressApplication): void {
  const appConfig = app.get<ConfigService<AppConfig, true>>(ConfigService).get('app', {
    infer: true,
  });

  // Respect X-Forwarded-* from the first proxy hop (load balancer / ingress) so
  // req.ip reflects the real client for rate limiting and request logs.
  app.set('trust proxy', 1);
  app.use(
    helmet({
      contentSecurityPolicy: {
        // Upgrading to HTTPS only makes sense behind TLS; locally it would break Swagger UI.
        directives: { upgradeInsecureRequests: appConfig.env === 'production' ? [] : null },
      },
    }),
  );
  app.enableCors({
    // Chrome extensions call from `chrome-extension://<id>` origins; list them in CORS_ORIGINS.
    origin: appConfig.corsOrigins.length ? appConfig.corsOrigins : appConfig.env !== 'production',
    credentials: true,
    exposedHeaders: ['x-request-id'],
  });

  app.setGlobalPrefix(appConfig.apiPrefix);
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.enableShutdownHooks();
}
