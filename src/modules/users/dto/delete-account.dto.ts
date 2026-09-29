import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class DeleteAccountDto {
  @ApiProperty({
    description: 'Current password, required to confirm deletion',
    example: 'Str0ngPass!',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password: string;
}
