// npm run db:backup — data/backup/ktx-YYYYMMDD-HHmm.db (SQLite online backup API, P1-10)
// Postgres(Supabase)는 대시보드의 자동 백업 또는 `supabase db dump` 사용
import fs from 'node:fs';
import path from 'node:path';
import { config, ROOT } from '../server/src/config.js';
import { openDb } from '../server/src/db.js';

if (config.databaseUrl) {
  console.error('Postgres 백업은 supabase db dump -f backup.sql 을 사용하세요.');
  process.exit(1);
}
const dir = path.join(ROOT, 'data', 'backup');
fs.mkdirSync(dir, { recursive: true });
const d = new Date();
const p2 = (n) => String(n).padStart(2, '0');
const name = `ktx-${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}.db`;
const db = await openDb(config.dbPath);
await db.raw.backup(path.join(dir, name));
await db.close();
console.log(`백업 완료: data/backup/${name}`);
