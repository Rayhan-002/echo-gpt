import { ApiProperty } from '@nestjs/swagger';

export class SessionResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({
    nullable: true,
    type: String,
    example: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
  })
  userAgent: string | null;

  @ApiProperty({ nullable: true, type: String, example: '203.0.113.42' })
  ipAddress: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  lastUsedAt: Date;

  @ApiProperty()
  expiresAt: Date;

  @ApiProperty({ description: 'True for the session making this request' })
  current: boolean;
}
