// 공통 설정: 프로젝트 루트의 .env를 읽고, 상대 경로는 루트 기준으로 해석한다.
// (npm -w server 로 실행하면 cwd가 server/ 이므로 cwd 기준 해석을 쓰지 않음)
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: path.join(ROOT, '.env'), quiet: true });

const fromRoot = (p) => (path.isAbsolute(p) ? p : path.join(ROOT, p));
// 환경변수 값 정리: 앞의 BOM(U+FEFF)·공백·줄바꿈 제거 (Windows 파이프로 등록하면 붙을 수 있음)
const clean = (v) => (v == null ? '' : String(v).replace(new RegExp('^\uFEFF'), '').trim());
for (const k of ['DATABASE_URL', 'ADMIN_KEY', 'DB_PATH', 'REALTIME', 'DEMO_MODE']) if (k in process.env) process.env[k] = clean(process.env[k]);

export const config = {
  port: Number(process.env.PORT ?? 3000),
  // 있으면 Postgres(Supabase) 사용, 없으면 SQLite 파일
  databaseUrl: process.env.DATABASE_URL || '',
  // 있으면 쓰기 API에 X-Admin-Key 헤더 필요 (배포용)
  adminKey: process.env.ADMIN_KEY || '',
  // 'sse'(로컬 서버) | 'poll'(Vercel 서버리스 — 연결 유지 불가)
  realtime: process.env.REALTIME ?? (process.env.VERCEL ? 'poll' : 'sse'),
  dbPath: process.env.DB_PATH === ':memory:' ? ':memory:' : fromRoot(process.env.DB_PATH ?? './data/ktx.db'),
  uploadDir: fromRoot(process.env.UPLOAD_DIR ?? './data/uploads'),
  demoMode: (process.env.DEMO_MODE ?? '1') !== '0',
  seedDir: path.join(ROOT, 'db', 'seed'),
  schemaFile: path.join(ROOT, 'db', 'schema.sql'),
  viewsFile: path.join(ROOT, 'db', 'views.sql'),
  webDist: path.join(ROOT, 'web', 'dist'),
};
