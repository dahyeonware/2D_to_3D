// DB 어댑터 — 같은 SQL(? 자리표시자)로 SQLite(로컬·테스트)와 Postgres(Supabase 배포)를 모두 사용한다.
//   DATABASE_URL 이 있으면 Postgres, 없으면 DB_PATH 의 SQLite 파일 (WORK_ORDER 4.1 PRAGMA 그대로)
// 인터페이스: all(sql, params) / get(sql, params) / run(sql, params) / exec(sql) / tx(async (t) => …) / close()
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

/** UTC 'YYYY-MM-DD HH:MM:SS' (SQLite datetime('now')와 같은 형식) */
export const nowUtc = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

export async function openDb(target = config.databaseUrl || config.dbPath) {
  return /^postgres(ql)?:\/\//.test(target) ? openPg(target) : openSqlite(target);
}

/* ---------------- SQLite (better-sqlite3, 동기 → Promise 래핑) ---------------- */
async function openSqlite(file) {
  const { default: Database } = await import('better-sqlite3'); // Vercel(Postgres 전용)에서는 로드하지 않음
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const raw = new Database(file);
  if (file !== ':memory:') raw.pragma('journal_mode = WAL'); // 읽기·쓰기 동시성
  raw.pragma('foreign_keys = ON'); // 외래키 강제 (SQLite 기본값은 OFF)
  raw.pragma('busy_timeout = 5000');

  const cache = new Map();
  const stmt = (sql) => {
    let s = cache.get(sql);
    if (!s) cache.set(sql, (s = raw.prepare(sql)));
    return s;
  };
  const api = {
    dialect: 'sqlite',
    raw,
    all: async (sql, params = []) => stmt(sql).all(...params),
    get: async (sql, params = []) => stmt(sql).get(...params),
    run: async (sql, params = []) => ({ changes: stmt(sql).run(...params).changes }),
    exec: async (sql) => void raw.exec(sql),
    close: async () => raw.close(),
  };
  // 트랜잭션: 연결이 하나뿐이므로 트랜잭션끼리는 순서대로 실행 (await 사이에 섞이지 않도록)
  let chain = Promise.resolve();
  api.tx = (fn) => {
    const run = async () => {
      raw.exec('BEGIN IMMEDIATE');
      try {
        const r = await fn(api);
        raw.exec('COMMIT');
        return r;
      } catch (err) {
        if (raw.inTransaction) raw.exec('ROLLBACK');
        throw err;
      }
    };
    const p = chain.then(run, run);
    chain = p.catch(() => {});
    return p;
  };
  return api;
}

/* ---------------- Postgres (node-postgres, Supabase 풀러) ---------------- */
const toPg = (sql) => {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
};

async function openPg(url) {
  const { default: pg } = await import('pg');
  pg.types.setTypeParser(20, (v) => Number(v)); // bigint(COUNT 등) → number
  const ssl = /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false };
  const pool = new pg.Pool({ connectionString: url, ssl, max: Number(process.env.PG_POOL_MAX ?? 3), idleTimeoutMillis: 10_000 });
  const wrap = (q) => ({
    dialect: 'pg',
    all: async (sql, params = []) => (await q(toPg(sql), params)).rows,
    get: async (sql, params = []) => (await q(toPg(sql), params)).rows[0],
    run: async (sql, params = []) => ({ changes: (await q(toPg(sql), params)).rowCount }),
    exec: async (sql) => void (await q(sql)),
  });
  const api = wrap((sql, params) => pool.query(sql, params));
  api.pool = pool;
  api.tx = async (fn) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const r = await fn(wrap((sql, params) => client.query(sql, params)));
      await client.query('COMMIT');
      return r;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  };
  api.close = () => pool.end();
  return api;
}

/** 스키마·뷰 생성 (SQLite 빈 DB에만. Postgres는 supabase/migrations 를 supabase db push 로 적용) */
export async function createSchema(db) {
  if (db.dialect !== 'sqlite') throw new Error('Postgres 스키마는 supabase db push 로 적용하세요');
  await db.exec(fs.readFileSync(config.schemaFile, 'utf8'));
  await db.exec(fs.readFileSync(config.viewsFile, 'utf8'));
}

export async function hasSchema(db) {
  const sql = db.dialect === 'pg'
    ? "SELECT 1 AS ok FROM information_schema.tables WHERE table_schema='public' AND table_name='equipment'"
    : "SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name='equipment'";
  return !!(await db.get(sql));
}

export async function isEmpty(db) {
  return !(await db.get('SELECT 1 AS ok FROM trainsets LIMIT 1'));
}
