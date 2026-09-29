import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsStrongPassword, MaxLength } from 'class-validator';

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/** Password policy: 8-128 chars with at least one letter and one digit. */
export const PasswordField = (description = 'Account password', example = 'Str0ngPass!') =>
  applyDecorators(
    ApiProperty({
      description: `${description}. ${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} characters, at least one letter and one number.`,
      example,
      minLength: PASSWORD_MIN_LENGTH,
      maxLength: PASSWORD_MAX_LENGTH,
    }),
    IsStrongPassword(
      {
        minLength: PASSWORD_MIN_LENGTH,
        minLowercase: 0,
        minUppercase: 0,
        minNumbers: 1,
        minSymbols: 0,
      },
      {
        message: `password must be at least ${PASSWORD_MIN_LENGTH} characters and contain a letter and a number`,
      },
    ),
    MaxLength(PASSWORD_MAX_LENGTH),
  );

/** Email input: trimmed, lower-cased and validated. */
export const EmailField = () =>
  applyDecorators(
    ApiProperty({ example: 'jane.doe@example.com', maxLength: 255 }),
    Transform(({ value }: { value: unknown }) =>
      typeof value === 'string' ? value.trim().toLowerCase() : value,
    ),
    IsEmail(),
    MaxLength(255),
  );

/** Trims string input (leaves other types untouched for the validators to reject). */
export const Trim = () =>
  Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));
