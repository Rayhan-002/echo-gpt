import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { MOCK_API_KEY, startMockOpenAi } from './utils/mock-openai-server';

/**
 * End-to-end tests against a real PostgreSQL database (migrated and seeded,
 * see README) and an in-process OpenAI-compatible mock.
 */
describe('EchoGPT API (e2e)', () => {
  let app: NestExpressApplication;
  let http: Server;
  let baseUrl: string;
  let mockAi: { server: Server; baseUrl: string };

  const adminCredentials = {
    email: process.env.SEED_ADMIN_EMAIL ?? 'admin@echogpt.local',
    password: process.env.SEED_ADMIN_PASSWORD ?? 'Admin@12345',
  };
  const user = { email: `e2e-${Date.now()}@example.com`, password: 'E2ePassw0rd' };
  let accessToken: string;
  let refreshToken: string;
  let adminToken: string;
  let providerId: string;

  beforeAll(async () => {
    mockAi = await startMockOpenAi();
    app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: ['error'] });
    configureApp(app);
    await app.listen(0, '127.0.0.1');
    http = app.getHttpServer();
    baseUrl = `http://127.0.0.1:${(http.address() as AddressInfo).port}/api/v1`;
  });

  afterAll(async () => {
    if (providerId) {
      await request(http)
        .delete(`/api/v1/admin/providers/${providerId}`)
        .auth(adminToken, { type: 'bearer' });
    }
    await app.close();
    mockAi.server.close();
  });

  describe('platform', () => {
    it('reports readiness including the database', async () => {
      const res = await request(http).get('/api/health').expect(200);
      expect(res.body.info.database.status).toBe('up');
    });

    it('returns the standard error envelope with a request id', async () => {
      const res = await request(http).get('/api/v1/does-not-exist').expect(404);
      expect(res.body).toMatchObject({
        statusCode: 404,
        error: 'Not Found',
        path: '/api/v1/does-not-exist',
      });
      expect(res.body.requestId).toBe(res.headers['x-request-id']);
    });

    it('rejects unknown and invalid fields', async () => {
      const res = await request(http)
        .post('/api/v1/auth/register')
        .send({ email: 'not-an-email', password: 'short', isAdmin: true })
        .expect(400);
      expect(res.body.message).toBe('Validation failed');
      expect(res.body.details).toEqual(
        expect.arrayContaining(['property isAdmin should not exist', 'email must be an email']),
      );
    });
  });

  describe('authentication', () => {
    it('registers a user on the free plan', async () => {
      const res = await request(http).post('/api/v1/auth/register').send(user).expect(201);
      expect(res.body.user).toMatchObject({
        email: user.email,
        role: 'USER',
        emailVerified: false,
      });
      expect(res.body.user).not.toHaveProperty('passwordHash');
      ({ accessToken, refreshToken } = res.body);
    });

    it('requires a bearer token on protected routes', async () => {
      await request(http).get('/api/v1/users/me').expect(401);
      await request(http).get('/api/v1/users/me').auth(accessToken, { type: 'bearer' }).expect(200);
    });

    it('rotates refresh tokens and revokes the session on reuse', async () => {
      const rotated = await request(http)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken })
        .expect(200);
      expect(rotated.body.refreshToken).not.toBe(refreshToken);

      const reuse = await request(http)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken })
        .expect(401);
      expect(reuse.body.message).toMatch(/reuse detected/);

      // The whole session is gone, including the freshly rotated tokens.
      await request(http)
        .get('/api/v1/users/me')
        .auth(rotated.body.accessToken as string, { type: 'bearer' })
        .expect(401);
    });

    it('logs in again and logs out immediately invalidating the access token', async () => {
      const login = await request(http).post('/api/v1/auth/login').send(user).expect(200);
      const token = login.body.accessToken as string;
      await request(http).post('/api/v1/auth/logout').auth(token, { type: 'bearer' }).expect(204);
      await request(http).get('/api/v1/users/me').auth(token, { type: 'bearer' }).expect(401);

      accessToken = (await request(http).post('/api/v1/auth/login').send(user)).body.accessToken;
    });
  });

  describe('authorization & admin', () => {
    it('forbids regular users from admin APIs', async () => {
      await request(http)
        .get('/api/v1/admin/dashboard')
        .auth(accessToken, { type: 'bearer' })
        .expect(403);
    });

    it('lets admins register an AI provider (key encrypted, never returned)', async () => {
      adminToken = (await request(http).post('/api/v1/auth/login').send(adminCredentials)).body
        .accessToken;

      const res = await request(http)
        .post('/api/v1/admin/providers')
        .auth(adminToken, { type: 'bearer' })
        .send({
          name: `E2E OpenAI ${Date.now()}`,
          type: 'OPENAI',
          apiKey: MOCK_API_KEY,
          baseUrl: mockAi.baseUrl,
        })
        .expect(201);
      providerId = res.body.id;
      expect(JSON.stringify(res.body)).not.toContain(MOCK_API_KEY);

      const health = await request(http)
        .post(`/api/v1/admin/providers/${providerId}/health-check`)
        .auth(adminToken, { type: 'bearer' })
        .expect(200);
      expect(health.body.health.status).toBe('HEALTHY');
    });
  });

  describe('chat', () => {
    let conversationId: string;

    it('sends a prompt and stores the conversation', async () => {
      const res = await request(http)
        .post('/api/v1/chat/messages')
        .auth(accessToken, { type: 'bearer' })
        .send({ content: 'hello there', providerId })
        .expect(201);

      expect(res.body.assistantMessage).toMatchObject({
        role: 'ASSISTANT',
        content: 'echo: hello there',
        promptTokens: 5,
        completionTokens: 3,
      });
      conversationId = res.body.conversation.id;

      const usage = await request(http)
        .get('/api/v1/subscriptions/me/usage')
        .auth(accessToken, { type: 'bearer' })
        .expect(200);
      expect(usage.body).toMatchObject({ used: 1, remaining: usage.body.limit - 1 });
    });

    it('streams a response over SSE and persists it', async () => {
      const res = await fetch(`${baseUrl}/chat/messages/stream`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ conversationId, content: 'stream this please' }),
      });
      expect(res.headers.get('content-type')).toContain('text/event-stream');

      const events = (await res.text())
        .split('\n\n')
        .filter(Boolean)
        .map((block) => ({
          event: /^event: (.*)$/m.exec(block)?.[1],
          data: JSON.parse(/^data: (.*)$/m.exec(block)?.[1] ?? 'null') as Record<string, unknown>,
        }));

      const text = events
        .filter((e) => e.event === 'delta')
        .map((e) => e.data.text)
        .join('');
      expect(events[0].event).toBe('start');
      expect(text).toBe('echo: stream this please');
      expect(events.at(-1)?.event).toBe('done');

      const messages = await request(http)
        .get(`/api/v1/chat/conversations/${conversationId}/messages`)
        .auth(accessToken, { type: 'bearer' })
        .expect(200);
      expect(messages.body.meta.total).toBe(4);
    });

    it('never lets concurrent requests exceed the daily plan quota', async () => {
      const racer = await request(http)
        .post('/api/v1/auth/register')
        .send({ email: `e2e-race-${Date.now()}@example.com`, password: 'E2ePassw0rd' })
        .expect(201);
      const token = racer.body.accessToken as string;
      const { limit } = (
        await request(http).get('/api/v1/subscriptions/me/usage').auth(token, { type: 'bearer' })
      ).body as { limit: number };

      const attempts = limit + 5;
      const statuses = await Promise.all(
        Array.from({ length: attempts }, (_, i) =>
          fetch(`${baseUrl}/chat/messages`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
            body: JSON.stringify({ content: `question ${i}`, providerId }),
          }).then((res) => res.status),
        ),
      );

      expect(statuses.filter((status) => status === 201)).toHaveLength(limit);
      expect(statuses.filter((status) => status === 429)).toHaveLength(5);
    });

    it('keeps conversations private to their owner', async () => {
      await request(http)
        .get(`/api/v1/chat/conversations/${conversationId}`)
        .auth(adminToken, { type: 'bearer' })
        .expect(404);
    });
  });
});
