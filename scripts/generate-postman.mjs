/**
 * Converts docs/openapi.json into a Postman collection (docs/postman/) and adds
 * collection variables plus test scripts that store the tokens returned by
 * register / login / refresh, so authenticated requests work immediately.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { promisify } from 'node:util';
import Converter from 'openapi-to-postmanv2';

const INPUT = 'docs/openapi.json';
const OUTPUT = 'docs/postman/EchoGPT.postman_collection.json';

const convert = promisify(Converter.convert);
const result = await convert(
  { type: 'string', data: readFileSync(INPUT, 'utf8') },
  {
    folderStrategy: 'Tags',
    requestParametersResolution: 'Example',
    exampleParametersResolution: 'Example',
    includeAuthInfoInExample: false,
  },
);
if (!result.result) {
  throw new Error(`Conversion failed: ${result.reason}`);
}

const collection = result.output[0].data;

collection.variable = [
  { key: 'baseUrl', value: 'http://localhost:3000', type: 'string' },
  { key: 'accessToken', value: '', type: 'string' },
  { key: 'refreshToken', value: '', type: 'string' },
];
collection.auth = {
  type: 'bearer',
  bearer: [{ key: 'token', value: '{{accessToken}}', type: 'string' }],
};

const saveTokensScript = {
  listen: 'test',
  script: {
    type: 'text/javascript',
    exec: [
      'if (pm.response.code === 200 || pm.response.code === 201) {',
      '  const body = pm.response.json();',
      "  pm.collectionVariables.set('accessToken', body.accessToken);",
      "  pm.collectionVariables.set('refreshToken', body.refreshToken);",
      '}',
    ],
  },
};

/** Walks folders/requests, wiring auth to the collection token. */
const visit = (items) => {
  for (const item of items) {
    if (item.item) {
      visit(item.item);
      continue;
    }
    const request = item.request;
    // Requests with bearer security inherit the collection's {{accessToken}}.
    if (request.auth?.type === 'bearer') request.auth = { type: 'inherit' };
    if (!request.auth) request.auth = { type: 'noauth' };

    const path = (request.url?.path ?? []).join('/');
    if (/auth\/(register|login|refresh)$/.test(path)) {
      item.event = [saveTokensScript];
    }
    if (path.endsWith('auth/refresh') && request.body?.raw) {
      request.body.raw = JSON.stringify({ refreshToken: '{{refreshToken}}' }, null, 2);
    }
  }
};
visit(collection.item);

mkdirSync('docs/postman', { recursive: true });
writeFileSync(OUTPUT, `${JSON.stringify(collection, null, 2)}\n`);
console.log(`Postman collection written to ${OUTPUT}`);
