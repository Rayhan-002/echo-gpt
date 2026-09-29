import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

export const SWAGGER_PATH = 'docs';
export const BEARER_AUTH = 'access-token';

const DESCRIPTION = `
REST API powering the **EchoGPT** multi-AI chat Chrome extension.

### Authentication
1. \`POST /api/v1/auth/register\` or \`POST /api/v1/auth/login\` returns an **access token** (short lived JWT) and a **refresh token** (opaque, long lived, rotated on every use).
2. Send the access token as \`Authorization: Bearer <token>\`. Click **Authorize** above to use it here.
3. When the access token expires call \`POST /api/v1/auth/refresh\`. Re-using an already rotated refresh token revokes the whole session.

### Errors
Every error uses the same envelope: \`{ statusCode, error, message, details?, path, timestamp, requestId }\`.
The \`x-request-id\` response header echoes the correlation id for support/debugging.

### Quotas
AI endpoints (chat, AI-assisted search) consume the caller's daily plan quota. Exceeding it returns **429**.
`;

export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('EchoGPT API')
    .setDescription(DESCRIPTION)
    .setVersion('1.0.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'JWT access token' },
      BEARER_AUTH,
    )
    .addTag('Health', 'Liveness / readiness probes')
    .addTag('Auth', 'Registration, login, token refresh, email verification')
    .addTag('Users', 'Current user profile & account management')
    .addTag('Subscriptions', 'Plans, subscription status, usage limits')
    .addTag('Providers', 'Enabled AI providers available to users')
    .addTag('Chat', 'Conversations with AI providers (incl. streaming)')
    .addTag('Search', 'AI-assisted web search')
    .addTag('Admin: Dashboard', 'Headline statistics (ADMIN)')
    .addTag('Admin: Users', 'User management: roles, activation, sessions (ADMIN)')
    .addTag('Admin: Subscriptions', 'Subscriptions and plan configuration (ADMIN)')
    .addTag('Admin: AI Providers', 'Manage AI providers, API keys, defaults and health (ADMIN)')
    .addTag('Admin: Analytics', 'API usage analytics (ADMIN)')
    .addTag('Admin: Logs', 'API request logs (ADMIN)')
    .addTag('Admin: System', 'System health and maintenance (ADMIN)')
    .build();

  return SwaggerModule.createDocument(app, config, {
    operationIdFactory: (controllerKey, methodKey) =>
      `${controllerKey.replace(/Controller$/, '')}_${methodKey}`,
  });
}

export function setupSwagger(app: INestApplication): void {
  SwaggerModule.setup(SWAGGER_PATH, app, createOpenApiDocument(app), {
    jsonDocumentUrl: `${SWAGGER_PATH}/openapi.json`,
    customSiteTitle: 'EchoGPT API Docs',
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
    },
  });
}
