// 서버 진입점: npm run dev (watch) / npm start
import fs from 'node:fs';
import { config } from './config.js';
import { openDb, hasSchema } from './db.js';
import { createApp } from './app.js';

if (!config.databaseUrl && config.dbPath !== ':memory:' && !fs.existsSync(config.dbPath)) {
  console.error(`DB 파일이 없습니다: ${config.dbPath}\n먼저 npm run db:init 을 실행하세요.`);
  process.exit(1);
}
const db = await openDb();
if (!(await hasSchema(db))) {
  console.error(config.databaseUrl ? 'Postgres에 스키마가 없습니다. supabase db push 를 실행하세요.' : 'DB에 스키마가 없습니다. npm run db:reset 을 실행하세요.');
  process.exit(1);
}
if (!config.databaseUrl) fs.mkdirSync(config.uploadDir, { recursive: true });

const app = createApp(db, config);
const server = app.listen(config.port, () => {
  console.log(`API 서버: http://localhost:${config.port}/api/health`);
  if (fs.existsSync(config.webDist)) console.log(`웹앱(빌드본): http://localhost:${config.port}`);
  console.log(`DB: ${db.dialect === 'pg' ? 'Postgres (DATABASE_URL)' : config.dbPath} · DEMO_MODE=${config.demoMode ? 1 : 0}` +
    ` · 쓰기 보호=${config.adminKey ? '관리 키' : '없음'}`);
});

const shutdown = async () => {
  server.close();
  await db.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
