import { Module } from '@nestjs/common';
import { RequestLogService } from './request-log.service';
import { RequestLoggingMiddleware } from './request-logging.middleware';

@Module({
  providers: [RequestLogService, RequestLoggingMiddleware],
  exports: [RequestLogService, RequestLoggingMiddleware],
})
export class RequestLogsModule {}
