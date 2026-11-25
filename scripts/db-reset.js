// npm run db:reset — 처음 상태로 되돌림
//   SQLite: DB 파일 삭제 후 db:init  /  Postgres(DATABASE_URL): 전체 TRUNCATE 후 시드 재적재
import fs from 'node:fs';
import { config } from '../server/src/config.js';

if (config.databaseUrl) {
  process.argv.push('--reset');
} else {
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      fs.rmSync(config.dbPath + suffix, { force: true });
    } catch (err) {
      console.error(`삭제 실패: ${config.dbPath + suffix} — 서버가 실행 중이면 먼저 종료하세요. (${err.code})`);
      process.exit(1);
    }
  }
  console.log('기존 DB 삭제 완료');
}
await import('./db-init.js');
