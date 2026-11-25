// npm run db:check — 무결성 검사 (WORK_ORDER 7.2). DATABASE_URL 이 있으면 Postgres 검사
// --any-counts : 시드 기준 건수 비교를 생략 (데이터를 추가·수정한 뒤 검사할 때)
import fs from 'node:fs';
import { config } from '../server/src/config.js';
import { openDb } from '../server/src/db.js';
import { checkIntegrity } from '../server/src/integrity.js';

if (!config.databaseUrl && !fs.existsSync(config.dbPath)) {
  console.error(`DB 파일이 없습니다: ${config.dbPath} (npm run db:init 먼저 실행)`);
  process.exit(1);
}
const db = await openDb();
const r = await checkIntegrity(db, { expectSeedCounts: !process.argv.includes('--any-counts') });
await db.close();
console.log('건수:', r.counts);
if (!r.ok) {
  console.error('무결성 검사 실패:\n - ' + r.errors.join('\n - '));
  process.exit(1);
}
console.log('무결성 검사 통과 ✔');
