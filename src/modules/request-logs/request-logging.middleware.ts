import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import { AppConfig } from '../../config/configuration';
import { SWAGGER_PATH } from '../../swagger';
import { RequestLogService } from './request-log.service';

/**
 * Records every API request (including ones rejected by guards, which
 * interceptors never see) once the response has closed.
 */
@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');
  /** Infrastructure endpoints that would only add noise to the request log. */
  private readonly excludedPrefixes: string[];

  constructor(
    private readonly logs: RequestLogService,
    config: ConfigService<AppConfig, true>,
  ) {
    const apiPrefix = config.get('app.apiPrefix', { infer: true });
    this.excludedPrefixes = [`/${apiPrefix}/health`, `/${SWAGGER_PATH}`];
  }

  use(req: Request, res: Response, next: NextFunction): void {
    if (this.excludedPrefixes.some((prefix) => req.originalUrl.startsWith(prefix))) {
      return next();
    }

    const startedAt = process.hrtime.bigint();
    res.once('close', () => {
      const durationMs = Number((process.hrtime.bigint() - startedAt) / 1_000_000n);
      // Query strings are dropped: they can carry secrets (e.g. ?token=).
      const path = req.originalUrl.split('?')[0].slice(0, 2048);
      const route = (req.route as { path?: string } | undefined)?.path ?? null;
      const statusCode = res.writableFinished ? res.statusCode : 499; // 499: client closed request

      this.logs.record({
        requestId: req.requestId ?? null,
        userId: req.user?.id ?? null,
        method: req.method,
        path,
        route: route ? `${req.baseUrl}${route}`.slice(0, 255) : null,
        statusCode,
        durationMs,
        ipAddress: req.ip?.slice(0, 45) ?? null,
        userAgent: req.header('user-agent')?.slice(0, 512) ?? null,
      });
      this.logger.log(`${req.method} ${path} ${statusCode} ${durationMs}ms`);
    });

    next();
  }
}
