import * as Joi from 'joi';

/**
 * Validates process environment at boot. The application refuses to start
 * with a misconfigured environment instead of failing later at runtime.
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().port().default(3000),
  API_PREFIX: Joi.string().default('api'),
  APP_URL: Joi.string().uri().default('http://localhost:3000'),
  CORS_ORIGINS: Joi.string().allow('').default(''),
  SWAGGER_ENABLED: Joi.boolean().default(true),
  LOG_JSON: Joi.boolean().default(false),

  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgres', 'postgresql'] })
    .required(),

  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_TTL: Joi.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: Joi.number().integer().min(1).default(30),
  EMAIL_VERIFICATION_TTL_HOURS: Joi.number().integer().min(1).default(24),
  PASSWORD_RESET_TTL_MINUTES: Joi.number().integer().min(5).default(30),

  // 32-byte key (base64 encoded) used for AES-256-GCM encryption of provider API keys.
  ENCRYPTION_KEY: Joi.string()
    .base64()
    .custom((value: string, helpers) =>
      Buffer.from(value, 'base64').length === 32 ? value : helpers.error('any.invalid'),
    )
    .required()
    .messages({ 'any.invalid': 'ENCRYPTION_KEY must decode to exactly 32 bytes' }),

  THROTTLE_TTL_SECONDS: Joi.number().integer().min(1).default(60),
  THROTTLE_LIMIT: Joi.number().integer().min(1).default(120),

  SMTP_HOST: Joi.string().allow('').default(''),
  SMTP_PORT: Joi.number().port().default(587),
  SMTP_SECURE: Joi.boolean().default(false),
  SMTP_USER: Joi.string().allow('').default(''),
  SMTP_PASSWORD: Joi.string().allow('').default(''),
  MAIL_FROM: Joi.string().default('EchoGPT <no-reply@echogpt.local>'),

  AI_REQUEST_TIMEOUT_MS: Joi.number().integer().min(1000).default(60000),

  SEARCH_ENGINE: Joi.string().valid('duckduckgo', 'tavily').default('duckduckgo'),
  TAVILY_API_KEY: Joi.string().allow('').default(''),
  SEARCH_CACHE_TTL_SECONDS: Joi.number().integer().min(0).default(3600),
});
