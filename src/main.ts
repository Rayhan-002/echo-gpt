import { ConsoleLogger, Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AppConfig } from './config/configuration';
import { setupSwagger, SWAGGER_PATH } from './swagger';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  const config = app.get<ConfigService<AppConfig, true>>(ConfigService);
  const appConfig = config.get('app', { infer: true });

  app.useLogger(new ConsoleLogger({ json: appConfig.logJson, colors: !appConfig.logJson }));

  // Respect X-Forwarded-* from the first proxy hop (load balancer / ingress) so
  // req.ip reflects the real client for rate limiting and request logs.
  app.set('trust proxy', 1);
  app.use(helmet());
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

  if (appConfig.swaggerEnabled) {
    setupSwagger(app);
  }

  await app.listen(appConfig.port);

  const logger = new Logger('Bootstrap');
  logger.log(`EchoGPT API listening on http://localhost:${appConfig.port}/${appConfig.apiPrefix}`);
  if (appConfig.swaggerEnabled) {
    logger.log(`Swagger docs available at http://localhost:${appConfig.port}/${SWAGGER_PATH}`);
  }
}

void bootstrap();
