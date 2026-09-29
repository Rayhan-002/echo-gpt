export type NodeEnv = 'development' | 'production' | 'test';

export interface AppConfig {
  app: {
    env: NodeEnv;
    port: number;
    apiPrefix: string;
    url: string;
    corsOrigins: string[];
    swaggerEnabled: boolean;
    logJson: boolean;
  };
  database: {
    url: string;
  };
  auth: {
    accessSecret: string;
    accessTtlSeconds: number;
    refreshTtlDays: number;
    emailVerificationTtlHours: number;
    passwordResetTtlMinutes: number;
  };
  security: {
    encryptionKey: string;
    throttleTtlSeconds: number;
    throttleLimit: number;
  };
  mail: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    password: string;
    from: string;
  };
  ai: {
    requestTimeoutMs: number;
  };
  search: {
    engine: 'duckduckgo' | 'tavily';
    tavilyApiKey: string;
    cacheTtlSeconds: number;
  };
}

const toBool = (value: string | undefined): boolean => value === 'true' || value === '1';

const toList = (value: string | undefined): string[] =>
  (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

/**
 * Maps the (already validated) flat environment into a typed, grouped config tree.
 * Consumers inject `ConfigService<AppConfig, true>` and read namespaces with `{ infer: true }`.
 */
export default (): AppConfig => {
  const env = process.env;
  return {
    app: {
      env: (env.NODE_ENV as NodeEnv) ?? 'development',
      port: Number(env.PORT ?? 3000),
      apiPrefix: env.API_PREFIX ?? 'api',
      url: env.APP_URL ?? 'http://localhost:3000',
      corsOrigins: toList(env.CORS_ORIGINS),
      swaggerEnabled: toBool(env.SWAGGER_ENABLED ?? 'true'),
      logJson: toBool(env.LOG_JSON),
    },
    database: {
      url: env.DATABASE_URL as string,
    },
    auth: {
      accessSecret: env.JWT_ACCESS_SECRET as string,
      accessTtlSeconds: Number(env.JWT_ACCESS_TTL_SECONDS ?? 900),
      refreshTtlDays: Number(env.REFRESH_TOKEN_TTL_DAYS ?? 30),
      emailVerificationTtlHours: Number(env.EMAIL_VERIFICATION_TTL_HOURS ?? 24),
      passwordResetTtlMinutes: Number(env.PASSWORD_RESET_TTL_MINUTES ?? 30),
    },
    security: {
      encryptionKey: env.ENCRYPTION_KEY as string,
      throttleTtlSeconds: Number(env.THROTTLE_TTL_SECONDS ?? 60),
      throttleLimit: Number(env.THROTTLE_LIMIT ?? 120),
    },
    mail: {
      host: env.SMTP_HOST ?? '',
      port: Number(env.SMTP_PORT ?? 587),
      secure: toBool(env.SMTP_SECURE),
      user: env.SMTP_USER ?? '',
      password: env.SMTP_PASSWORD ?? '',
      from: env.MAIL_FROM ?? 'EchoGPT <no-reply@echogpt.local>',
    },
    ai: {
      requestTimeoutMs: Number(env.AI_REQUEST_TIMEOUT_MS ?? 60000),
    },
    search: {
      engine: (env.SEARCH_ENGINE as 'duckduckgo' | 'tavily') ?? 'duckduckgo',
      tavilyApiKey: env.TAVILY_API_KEY ?? '',
      cacheTtlSeconds: Number(env.SEARCH_CACHE_TTL_SECONDS ?? 3600),
    },
  };
};
