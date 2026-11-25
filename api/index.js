// Vercel 서버리스 함수 진입점 — /api/* 요청을 Express 앱으로 처리 (vercel.json rewrites)
// 환경변수: DATABASE_URL(Supabase 풀러), ADMIN_KEY(쓰기 보호), DEMO_MODE
import { openDb } from '../server/src/db.js';
import { createApp } from '../server/src/app.js';
import { config } from '../server/src/config.js';

if (!/^postgres(ql)?:\/\//.test(config.databaseUrl))
  throw new Error('DATABASE_URL 환경변수가 없거나 형식이 올바르지 않습니다 (Vercel 프로젝트 설정 확인)');
const db = await openDb(config.databaseUrl);
const app = createApp(db, { ...config, webDist: '/__no_static__' });

export default app;
