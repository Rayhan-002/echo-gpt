import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { ErrorResponseDto } from '../dto/error-response.dto';

const DESCRIPTIONS: Partial<Record<HttpStatus, string>> = {
  [HttpStatus.BAD_REQUEST]: 'Validation failed or malformed request',
  [HttpStatus.UNAUTHORIZED]: 'Missing, invalid or expired credentials',
  [HttpStatus.FORBIDDEN]: 'Authenticated but not allowed to perform this action',
  [HttpStatus.NOT_FOUND]: 'Resource not found',
  [HttpStatus.CONFLICT]: 'Resource conflicts with existing state',
  [HttpStatus.TOO_MANY_REQUESTS]: 'Rate limit or plan quota exceeded',
  [HttpStatus.BAD_GATEWAY]: 'Upstream AI / search provider failed',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'Dependency unavailable',
};

/** Documents the standard error envelope for each given status code. */
export const ApiErrorResponses = (...statuses: HttpStatus[]) =>
  applyDecorators(
    ...statuses.map((status) =>
      ApiResponse({
        status,
        description: DESCRIPTIONS[status] ?? 'Error',
        type: ErrorResponseDto,
      }),
    ),
  );
