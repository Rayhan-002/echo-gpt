import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { STATUS_CODES } from 'node:http';
import { ErrorResponseDto } from '../dto/error-response.dto';

interface NormalizedError {
  status: number;
  message: string;
  details?: string[];
}

/**
 * Converts every thrown error into the documented `ErrorResponseDto` envelope.
 * Unknown errors are logged with their stack and surfaced as a generic 500 so
 * internals never leak to clients.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const { status, message, details } = this.normalize(exception);

    if (status >= Number(HttpStatus.INTERNAL_SERVER_ERROR)) {
      const summary = `${request.method} ${request.originalUrl} -> ${status} [${request.requestId}]`;
      if (exception instanceof HttpException) {
        // Deliberate 5xx (e.g. upstream provider failure): no stack trace needed.
        this.logger.warn(`${summary}: ${message}`);
      } else {
        this.logger.error(
          summary,
          exception instanceof Error ? exception.stack : String(exception),
        );
      }
    }

    // Streaming endpoints may already have flushed headers.
    if (response.headersSent) {
      response.end();
      return;
    }

    const body: ErrorResponseDto = {
      statusCode: status,
      error: STATUS_CODES[status] ?? 'Error',
      message,
      ...(details?.length ? { details } : {}),
      path: request.originalUrl,
      timestamp: new Date().toISOString(),
      requestId: request.requestId ?? '',
    };

    response.status(status).json(body);
  }

  private normalize(exception: unknown): NormalizedError {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();

      if (typeof payload === 'string') {
        return { status, message: payload };
      }

      const { message } = payload as { message?: string | string[] };
      if (Array.isArray(message)) {
        return { status, message: 'Validation failed', details: message };
      }
      return { status, message: message ?? exception.message };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const mapped = this.fromPrismaError(exception);
      if (mapped) return mapped;
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'An unexpected error occurred',
    };
  }

  /** Maps well-known Prisma errors that escaped the service layer to HTTP semantics. */
  private fromPrismaError(error: Prisma.PrismaClientKnownRequestError): NormalizedError | null {
    switch (error.code) {
      case 'P2002': {
        const target = error.meta?.target;
        const fields = Array.isArray(target) ? target.join(', ') : 'unique field';
        return {
          status: HttpStatus.CONFLICT,
          message: `A record with this ${fields} already exists`,
        };
      }
      case 'P2025':
        return { status: HttpStatus.NOT_FOUND, message: 'Resource not found' };
      case 'P2003':
        return {
          status: HttpStatus.CONFLICT,
          message: 'Operation conflicts with a related record',
        };
      default:
        return null;
    }
  }
}
