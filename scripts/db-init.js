// npm run db:init — 스키마 생성 → seed 적재 → 무결성 검사
//   SQLite(기본): schema.sql + views.sql 실행 후 적재
//   Postgres(DATABASE_URL 설정 시): 스키마는 supabase db push 로 먼저 적용, 여기서는 시드만 적재
//   --reset : Postgres 데이터를 모두 지우고 다시 적재 (db:reset 에서 사용)
import fs from 'node:fs';
import { config } from '../server/src/config.js';
import { openDb, createSchema, hasSchema, isEmpty } from '../server/src/db.js';
import { seedDatabase } from '../server/src/seed.js';
import { checkIntegrity } from '../server/src/integrity.js';

const TABLES = ['audit_log', 'status_events', 'issue_devices', 'equipment_issues', 'maintenance_records', 'fault_codes',
  'manual_items', 'manuals', 'connections', 'equipment', 'bogies', 'models_3d', 'drawings', 'cars', 'trainsets',
  'equipment_types', 'protocols', 'categories', 'users'];

const reset = process.argv.includes('--reset');
const db = await openDb();
const where = db.dialect === 'pg' ? 'Postgres (DATABASE_URL)' : config.dbPath;

try {
  if (db.dialect === 'pg') {
    if (!(await hasSchema(db))) throw new Error('스키마가 없습니다. 먼저 supabase db push 를 실행하세요.');
    if (reset) {
      await db.exec(`TRUNCATE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`);
      console.log('기존 데이터 삭제 완료');
    } else if (!(await isEmpty(db))) {
      console.log(`이미 데이터가 있습니다: ${where}\n처음 상태로 되돌리려면 npm run db:reset`);
      process.exit(0);
    }
    await seedDatabase(db);
  } else {
    fs.mkdirSync(config.uploadDir, { recursive: true });
    if (await hasSchema(db)) {
      console.log(`이미 초기화된 DB입니다: ${where}\n처음 상태로 되돌리려면 npm run db:reset 을 실행하세요.`);
      process.exit(0);
    }
    try {
      await createSchema(db);
      await seedDatabase(db);
    } catch (err) {
      await db.close();
      fs.rmSync(config.dbPath, { force: true });
      throw err;
    }
  }
} catch (err) {
  console.error('시드 적재 실패:', err.message);
  process.exit(1);
}

const r = await checkIntegrity(db);
await db.close();
console.log(`DB: ${where}`);
console.log('건수:', r.counts);
if (!r.ok) {
  console.error('무결성 검사 실패:\n - ' + r.errors.join('\n - '));
  process.exit(1);
}
console.log('무결성 검사 통과 ✔');
