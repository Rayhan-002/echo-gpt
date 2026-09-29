import { ApiProperty } from '@nestjs/swagger';

export class MessageResponseDto {
  @ApiProperty({ example: 'Operation completed successfully' })
  message: string;

  constructor(message: string) {
    this.message = message;
  }
}
