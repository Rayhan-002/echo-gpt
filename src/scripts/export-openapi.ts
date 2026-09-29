/**
 * Writes the OpenAPI document to docs/openapi.json without starting the server
 * or connecting to the database. Run from the compiled output (npm run docs:openapi)
 * so the Swagger CLI plugin metadata is included.
 */
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { AppModule } from '../app.module';
import { configureApp } from '../app.setup';
import { createOpenApiDocument } from '../swagger';

async function exportOpenApi(): Promise<void> {
  // create() instantiates modules but, without init()/listen(), runs no lifecycle hooks.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: ['error'] });
  configureApp(app);

  const outputPath = resolve(process.cwd(), 'docs', 'openapi.json');
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(createOpenApiDocument(app), null, 2)}\n`);
  await app.close();

  process.stdout.write(`OpenAPI document written to ${outputPath}\n`);
}

void exportOpenApi();
