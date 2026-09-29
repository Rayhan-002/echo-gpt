import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { AppConfig } from '../config/configuration';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: ConfigService<AppConfig, true>) {
    const isDev = config.get('app.env', { infer: true }) === 'development';
    super({
      datasourceUrl: config.get('database.url', { infer: true }),
      log: isDev ? ['warn', 'error'] : ['error'],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Database connection established');
  }

  /**
   * Disconnect in the last shutdown phase, after every module's onModuleDestroy
   * (e.g. the request-log buffer flush) has run.
   */
  async onApplicationShutdown(): Promise<void> {
    await this.$disconnect();
  }
}
