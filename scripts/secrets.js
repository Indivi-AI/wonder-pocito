#!/usr/bin/env node
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { readFile, writeFile } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const [,, operation, env] = process.argv;
if (!operation || !env) throw new Error(`❌ Usage: node secrets.js [pull|push|delete] [dev|prod]`);

const client = new SecretManagerServiceClient();
const PROJECT_ID = 'indiviai';
const SECRET_NAME = `wonder-secrets-${env}`;
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '..', 'cloud-services', 'express-server', `.env.${env}`);

const pull = async () => {
  const [version] = await client.accessSecretVersion({ name: `projects/${PROJECT_ID}/secrets/${SECRET_NAME}/versions/latest` });
  await writeFile(envPath, version.payload.data.toString());
  console.log(`✅ Secrets pulled to ${envPath.split('/').slice(-2).join('/')} from ${SECRET_NAME}`);
};

const push = async () => {
  const content = await readFile(envPath, 'utf8');
  const [version] = await client.addSecretVersion({ parent: `projects/${PROJECT_ID}/secrets/${SECRET_NAME}`, payload: { data: Buffer.from(content, 'utf8') } });
  console.log(`✅ Secrets pushed from ${envPath.split('/').slice(-2).join('/')} to ${SECRET_NAME} (version: ${version.name.split('/').pop()})`);
};

const deleteSecret = async () => {
  await client.destroySecretVersion({ name: `projects/${PROJECT_ID}/secrets/${SECRET_NAME}/versions/latest` });
  console.log(`✅ Secret ${SECRET_NAME} (latest version) soft deleted`);
};

const ops = { pull, push, delete: deleteSecret };
(ops[operation] || (() => { throw new Error(`❌ Unknown operation: ${operation}`) }))().catch(err => { console.error(err); process.exit(1); });

