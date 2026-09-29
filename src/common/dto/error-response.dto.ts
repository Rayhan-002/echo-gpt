import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Uniform error envelope returned by every failing request. */
export class ErrorResponseDto {
  @ApiProperty({ example: 400 })
  statusCode: number;

  @ApiProperty({ example: 'Bad Request' })
  error: string;

  @ApiProperty({ example: 'Validation failed' })
  message: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['email must be an email', 'password must be longer than or equal to 8 characters'],
    description: 'Field level details, present for validation errors.',
  })
  details?: string[];

  @ApiProperty({ example: '/api/v1/auth/register' })
  path: string;

  @ApiProperty({ example: '2026-09-29T10:15:30.000Z' })
  timestamp: string;

  @ApiProperty({ example: '6f1c2c1e-6c47-4f0e-9a36-0c5f0f4b1a2d' })
  requestId: string;
}
