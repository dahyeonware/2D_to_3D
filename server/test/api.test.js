import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { makeApp } from './helpers.js';
import { checkIntegrity } from '../src/integrity.js';

let app, db;
beforeEach(async () => ({ app, db } = await makeApp()));

describe('시드·무결성', () => {
  it('기대 건수와 무결성 검사 통과', async () => {
    const r = await checkIntegrity(db);
    expect(r.errors).toEqual([]);
    expect(r.counts).toEqual({ equipment: 105, connections: 131, issues: 2, maintenance: 416, manuals: 27 });
  });
});

describe('조회 API (GET)', () => {
  const ok = [
    '/api/health',
    '/api/reference',
    '/api/trainsets',
    '/api/trainsets/1/bootstrap',
    '/api/trainsets/1/equipment',
    '/api/trainsets/1/equipment?car=T3&status=주의',
    '/api/trainsets/1/equipment/T3-DCU-01',
    '/api/trainsets/1/equipment/T3-DCU-01/maintenance?limit=5',
    '/api/trainsets/1/equipment/T3-DCU-01/status-history',
    '/api/manuals/by-type/DCU',
    '/api/fault-codes/DR-201',
    '/api/trainsets/1/issues?open=1',
    '/api/trainsets/1/graph/neighbors/PC1-TCMS-01?depth=2',
    '/api/trainsets/1/graph/impact/MC1-CONV-01',
    '/api/trainsets/1/graph/upstream/T3-DCU-01',
    '/api/trainsets/1/search?q=tcms',
  ];
  it.each(ok)('200 %s', async (url) => {
    const res = await request(app).get(encodeURI(url));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/json/);
  });

  const missing = [
    '/api/trainsets/99/bootstrap',
    '/api/trainsets/1/equipment/NOPE-01',
    '/api/trainsets/1/equipment/NOPE-01/maintenance',
    '/api/manuals/by-type/NOPE',
    '/api/fault-codes/XX-000',
    '/api/trainsets/1/graph/impact/NOPE',
    '/api/nope',
  ];
  it.each(missing)('404 %s', async (url) => {
    const res = await request(app).get(url);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('health 응답 형식', async () => {
    const { body } = await request(app).get('/api/health');
    expect(body.ok).toBe(true);
    expect(body.counts.equipment).toBe(105);
  });

  it('정비 내역 최신순·limit', async () => {
    const { body } = await request(app).get('/api/trainsets/1/equipment/PC1-TCMS-01/maintenance?limit=3');
    expect(body).toHaveLength(3);
    const dates = body.map((r) => r.date);
    expect([...dates].sort().reverse()).toEqual(dates);
    const all = await request(app).get('/api/trainsets/1/equipment/PC1-TCMS-01/maintenance');
    expect(all.body.length).toBeGreaterThan(3);
  });

  it('검색은 최대 10건', async () => {
    const { body } = await request(app).get('/api/trainsets/1/search?q=-');
    expect(body.length).toBe(10);
  });

  it('매뉴얼 형식 (interval/safety/steps/tools/faults)', async () => {
    const { body } = await request(app).get('/api/manuals/by-type/DCU');
    for (const k of ['interval', 'safety', 'steps', 'tools', 'faults']) expect(Array.isArray(body[k])).toBe(true);
    expect(body.isVirtual).toBe(true);
    expect(body.faults.some((f) => f.code === 'DR-201')).toBe(true);
  });
});

describe('쓰기 API', () => {
  it('정비 내역 등록 → 최신순 첫 행, 최근 점검일 갱신, 검증', async () => {
    const url = '/api/trainsets/1/equipment/T3-DCU-01/maintenance';
    const res = await request(app).post(url).send({
      date: '2099-01-02', type: '고장수리', team: '객실설비 정비팀', hours: 1,
      summary: '[DR-201] 끼임 감지 센서 교체 후 개폐 시험 정상', parts: '끼임 감지 센서', result: '정상', faultCode: 'DR-201',
    });
    expect(res.status).toBe(201);
    expect(res.body.record.id).toMatch(/^MR-T3-DCU-01-\d+$/);
    const list = await request(app).get(`${url}?limit=1`);
    expect(list.body[0].id).toBe(res.body.record.id);

    const ins = await request(app).post(url).send({ date: '2099-02-03', type: '정기점검', summary: '월간 점검', result: '정상' });
    expect(ins.status).toBe(201);
    expect(ins.body.lastInspection).toBe('2099-02-03');
    const eq = await request(app).get('/api/trainsets/1/equipment/T3-DCU-01');
    expect(eq.body.lastInspection).toBe('2099-02-03');

    const bad = await request(app).post(url).send({ date: '2026-13-40', type: '수리', summary: '' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('BAD_REQUEST');
    const wrongFault = await request(app).post(url).send({ date: '2026-11-25', type: '고장수리', summary: 'x', faultCode: 'TC-001' });
    expect(wrongFault.status).toBe(400);
  });

  it('상태 변경 → status_events 생성, 이력 조회', async () => {
    const res = await request(app).patch('/api/trainsets/1/equipment/T1-HVAC-01/status').send({ status: '고장', note: '송풍 불량' });
    expect(res.status).toBe(200);
    expect(res.body.equipment.ownStatus).toBe('고장');
    expect(res.body.equipment.status).toBe('고장');
    const h = await request(app).get('/api/trainsets/1/equipment/T1-HVAC-01/status-history');
    expect(h.body[0]).toMatchObject({ status: '고장', note: '송풍 불량', source: 'manual' });
    expect((await db.get('SELECT COUNT(*) AS n FROM audit_log')).n).toBeGreaterThan(0);
    const bad = await request(app).patch('/api/trainsets/1/equipment/T1-HVAC-01/status').send({ status: '파손' });
    expect(bad.status).toBe(400);
  });

  it("장치 간 문제 '조치 완료' → 유효 상태 해제, 부트스트랩에서 제외", async () => {
    const before = await request(app).get('/api/trainsets/1/equipment/T4-GW-01');
    expect(before.body.ownStatus).toBe('정상');
    expect(before.body.status).toBe('주의');
    const res = await request(app).patch('/api/trainsets/1/issues/IS-01').send({ status: '조치 완료' });
    expect(res.status).toBe(200);
    expect(res.body.closedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const after = await request(app).get('/api/trainsets/1/equipment/T4-GW-01');
    expect(after.body.status).toBe('정상');
    const boot = await request(app).get('/api/trainsets/1/bootstrap');
    expect(boot.body.issues.map((i) => i.id)).toEqual(['IS-02']);
    // 되돌리면 다시 경고
    await request(app).patch('/api/trainsets/1/issues/IS-01').send({ status: '조치 중' });
    expect((await request(app).get('/api/trainsets/1/equipment/T4-GW-01')).body.status).toBe('주의');
  });

  it('장치 간 문제 등록 시 직접 연결 자동 채움', async () => {
    const res = await request(app).post('/api/trainsets/1/issues').send({
      title: '테스트', type: '통신 품질', severity: '주의', devices: ['PC1-PAN-01', 'PC1-VCB-01'],
    });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe('IS-03');
    expect(res.body.connection).toBe('C001');
    expect((await checkIntegrity(db, { expectSeedCounts: false })).errors).toEqual([]);
  });
});

describe('관리 키 보호 (배포용 ADMIN_KEY)', () => {
  it('키가 없거나 틀리면 401, 맞으면 저장 · 조회는 키 없이 가능', async () => {
    const { app: secured } = await makeApp({ adminKey: 'test-key-123' });
    const url = '/api/trainsets/1/equipment/T1-HVAC-01/status';
    expect((await request(secured).patch(url).send({ status: '주의' })).status).toBe(401);
    expect((await request(secured).patch(url).set('X-Admin-Key', 'wrong').send({ status: '주의' })).body.error.code).toBe('UNAUTHORIZED');
    expect((await request(secured).patch(url).set('X-Admin-Key', 'test-key-123').send({ status: '주의' })).status).toBe(200);
    expect((await request(secured).get('/api/trainsets/1/bootstrap')).status).toBe(200);
    expect((await request(secured).get('/api/reference')).body.app.writeProtected).toBe(true);
  });
  it('/live 는 상태·열린 이슈만 반환', async () => {
    const { body } = await request(app).get('/api/trainsets/1/live');
    expect(body.equipment).toHaveLength(105);
    expect(body.equipment.find((e) => e.id === 'T4-GW-01')).toMatchObject({ status: '주의', ownStatus: '정상' });
    expect(body.issues.map((i) => i.id)).toEqual(['IS-01', 'IS-02']);
  });
});
