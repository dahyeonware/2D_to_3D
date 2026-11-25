import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { openDb, createSchema } from '../src/db.js';
import { seedDatabase } from '../src/seed.js';
import { createApp } from '../src/app.js';
import { config, ROOT } from '../src/config.js';

/** 시드가 적재된 메모리 DB + 앱 */
export async function makeApp(overrides = {}) {
  const db = await openDb(':memory:');
  await createSchema(db);
  await seedDatabase(db);
  const app = createApp(db, { ...config, dbPath: ':memory:', databaseUrl: '', adminKey: '', realtime: 'sse', webDist: path.join(ROOT, '__none__'), ...overrides });
  return { db, app };
}

/** prototype/index.html의 데이터 상수를 그대로 실행해 꺼낸다 (동등성 비교용) */
export function prototypeConstants() {
  const html = fs.readFileSync(path.join(ROOT, 'prototype', 'index.html'), 'utf8');
  const src = html.split('<script>')[1].split('</script>')[0];
  const ctx = {};
  vm.runInNewContext(`${src}\n;globalThis.__d={TRAINSET,EQUIPMENT,CONNECTIONS,ISSUES,MAINTENANCE,MANUALS};`, ctx);
  return JSON.parse(JSON.stringify(ctx.__d));
}
