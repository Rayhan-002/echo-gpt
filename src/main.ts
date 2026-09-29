import { ConsoleLogger, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { AppConfig } from './config/configuration';
import { setupSwagger, SWAGGER_PATH } from './swagger';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  const appConfig = app.get<ConfigService<AppConfig, true>>(ConfigService).get('app', {
    infer: true,
  });

  app.useLogger(new ConsoleLogger({ json: appConfig.logJson, colors: !appConfig.logJson }));
  configureApp(app);
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
