// 쓰기 API (WORK_ORDER 5.2 — P0: 정비 내역 등록, 장비 상태 변경, 장치 간 문제 처리/등록)
// ADMIN_KEY 환경변수가 있으면 X-Admin-Key 헤더가 맞아야 쓸 수 있다 (배포본 보호). 모든 쓰기는 audit_log에 기록.
import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { HttpError, notFound, badRequest, parseBody, asyncRouter } from '../http.js';
import { nowUtc } from '../db.js';

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD 형식이어야 합니다')
  .refine((s) => !Number.isNaN(Date.parse(s)), '존재하지 않는 날짜입니다');
const STATUS = z.enum(['정상', '주의', '고장']);
const ISSUE_STATUS = z.enum(['원인 분석 중', '원인 분석 완료', '조치 예정', '조치 중', '조치 완료']);

const MaintenanceBody = z.object({
  date: DATE,
  type: z.enum(['정기점검', '부품교체', '고장수리', '개량']),
  team: z.string().trim().max(60).optional().default(''),
  hours: z.coerce.number().min(0).max(1000).optional().nullable(),
  summary: z.string().trim().min(1, '작업 내용을 입력하세요').max(500),
  parts: z.string().trim().max(200).optional().default('-'),
  result: z.string().trim().min(1).max(30).default('정상'),
  faultCode: z.string().trim().max(20).optional().nullable(),
});
const StatusBody = z.object({ status: STATUS, note: z.string().trim().max(500).optional().default('') });
const IssuePatchBody = z
  .object({ status: ISSUE_STATUS.optional(), action: z.string().trim().max(500).optional() })
  .refine((b) => b.status !== undefined || b.action !== undefined, '변경할 status 또는 action이 필요합니다');
const IssueCreateBody = z.object({
  title: z.string().trim().min(1).max(200),
  type: z.string().trim().min(1).max(60),
  severity: z.enum(['주의', '고장']),
  devices: z.array(z.string().min(1)).length(2).refine((d) => d[0] !== d[1], '서로 다른 두 장비여야 합니다'),
  cause: z.string().trim().max(1000).optional(),
  evidence: z.string().trim().max(1000).optional(),
  action: z.string().trim().max(500).optional(),
  status: ISSUE_STATUS.optional().default('원인 분석 중'),
  since: DATE.optional(),
});

const today = () => new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD (로컬)

/** 관리 키 확인 (상수 시간 비교) */
export function requireAdminKey(adminKey) {
  const expected = Buffer.from(adminKey);
  return (req, res, next) => {
    if (!adminKey || req.method === 'GET') return next();
    const got = Buffer.from(String(req.get('x-admin-key') ?? ''));
    if (got.length === expected.length && crypto.timingSafeEqual(got, expected)) return next();
    next(new HttpError(401, 'UNAUTHORIZED', '관리 키가 필요합니다'));
  };
}

export function writeRoutes({ db, data, bus, config }) {
  const r = asyncRouter(Router());
  r.use(requireAdminKey(config.adminKey));

  const log = (t, action, entity, id, before, after) =>
    t.run('INSERT INTO audit_log (user_id,action,entity,entity_id,before_json,after_json,at) VALUES (NULL,?,?,?,?,?,?)',
      [action, entity, String(id), before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null, nowUtc()]);

  const tsParam = async (req) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || !(await data.trainsetExists(id))) throw notFound(`편성 ${req.params.id}`);
    return id;
  };
  const eqParam = async (req, tsId) => {
    const e = await data.equipmentOne(tsId, req.params.eqId);
    if (!e) throw notFound(`장비 ${req.params.eqId}`);
    return e;
  };

  // ----- 정비 내역 등록 (P0-8) -----
  r.post('/trainsets/:id/equipment/:eqId/maintenance', async (req, res) => {
    const tsId = await tsParam(req);
    const e = await eqParam(req, tsId);
    const b = parseBody(MaintenanceBody, req.body);
    if (b.faultCode) {
      const man = await data.manualByType(e.code);
      if (!man || !man.faults.some((f) => f.code === b.faultCode))
        throw badRequest(`고장 코드 ${b.faultCode}는 ${e.code} 매뉴얼에 없습니다`);
    }
    const created = await db.tx(async (t) => {
      const prefix = `MR-${e.id}-`;
      const ids = (await t.all('SELECT id FROM maintenance_records WHERE trainset_id=? AND equipment_id=?', [tsId, e.id])).map((x) => x.id);
      const max = Math.max(0, ...ids.filter((x) => x.startsWith(prefix)).map((x) => Number(x.slice(prefix.length)) || 0));
      const id = `${prefix}${String(max + 1).padStart(2, '0')}`;
      await t.run(`INSERT INTO maintenance_records
        (id,trainset_id,equipment_id,date,type,team,hours,summary,parts,result,fault_code,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [id, tsId, e.id, b.date, b.type, b.team || null, b.hours ?? null, b.summary, b.parts || '-', b.result, b.faultCode || null, nowUtc()]);
      await log(t, 'create', 'maintenance_records', id, null, { ...b, id, equipmentId: e.id });
      return id;
    });
    const after = await data.equipmentOne(tsId, e.id);
    const record = (await data.maintenance(tsId, e.id)).find((m) => m.id === created);
    bus.publish('maintenance-added', { trainsetId: tsId, equipmentId: e.id, id: created, lastInspection: after.lastInspection });
    res.status(201).json({ record, lastInspection: after.lastInspection });
  });

  // ----- 장비 상태 변경 (P0-9) -----
  r.patch('/trainsets/:id/equipment/:eqId/status', async (req, res) => {
    const tsId = await tsParam(req);
    const e = await eqParam(req, tsId);
    const b = parseBody(StatusBody, req.body);
    const eventId = await db.tx(async (t) => {
      const at = nowUtc();
      await t.run('UPDATE equipment SET status=?, updated_at=? WHERE trainset_id=? AND id=?', [b.status, at, tsId, e.id]);
      const ev = await t.get(`INSERT INTO status_events (trainset_id,equipment_id,status,source,note,at)
        VALUES (?,?,?,'manual',?,?) RETURNING id`, [tsId, e.id, b.status, b.note || null, at]);
      await log(t, 'update', 'equipment', `${tsId}/${e.id}`, { status: e.ownStatus }, { status: b.status, note: b.note });
      return Number(ev.id);
    });
    const after = await data.equipmentOne(tsId, e.id);
    bus.publish('status-changed', { trainsetId: tsId, equipmentId: e.id, ownStatus: after.ownStatus, status: after.status });
    res.json({ equipment: after, eventId });
  });

  // ----- 장치 간 문제 상태·조치 변경 (P0-10) -----
  r.patch('/trainsets/:id/issues/:issueId', async (req, res) => {
    const tsId = await tsParam(req);
    const before = await data.issue(tsId, req.params.issueId);
    if (!before) throw notFound(`장치 간 문제 ${req.params.issueId}`);
    const b = parseBody(IssuePatchBody, req.body);
    const status = b.status ?? before.status;
    const closedAt = status === '조치 완료' ? (before.status === '조치 완료' ? before.closedAt : today()) : null;
    await db.tx(async (t) => {
      await t.run('UPDATE equipment_issues SET status=?, action=?, closed_at=? WHERE trainset_id=? AND id=?',
        [status, b.action ?? before.action, closedAt ?? null, tsId, before.id]);
      await log(t, 'update', 'equipment_issues', before.id, before, { status, action: b.action ?? before.action, closedAt });
    });
    const after = await data.issue(tsId, before.id);
    bus.publish('issue-changed', { trainsetId: tsId, issueId: after.id, status: after.status, devices: after.devices });
    res.json(after);
  });

  // ----- 장치 간 문제 등록 -----
  r.post('/trainsets/:id/issues', async (req, res) => {
    const tsId = await tsParam(req);
    const b = parseBody(IssueCreateBody, req.body);
    for (const d of b.devices) if (!(await data.equipmentOne(tsId, d))) throw badRequest(`장비 ${d}가 없습니다`);
    const connection = await data.connectionBetween(tsId, b.devices[0], b.devices[1]); // 직접 연결 자동 채움
    const id = await db.tx(async (t) => {
      const ids = (await t.all(`SELECT id FROM equipment_issues WHERE id LIKE 'IS-%'`)).map((x) => x.id);
      const nid = `IS-${String(Math.max(0, ...ids.map((x) => Number(x.slice(3)) || 0)) + 1).padStart(2, '0')}`;
      await t.run(`INSERT INTO equipment_issues
        (id,trainset_id,title,type,severity,cause,evidence,action,status,connection_id,since,closed_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [nid, tsId, b.title, b.type, b.severity, b.cause ?? null, b.evidence ?? null, b.action ?? null,
          b.status, connection, b.since ?? today(), b.status === '조치 완료' ? today() : null]);
      for (const [i, d] of b.devices.entries())
        await t.run('INSERT INTO issue_devices (issue_id,trainset_id,equipment_id,seq) VALUES (?,?,?,?)', [nid, tsId, d, i + 1]);
      await log(t, 'create', 'equipment_issues', nid, null, { ...b, connection });
      return nid;
    });
    const after = await data.issue(tsId, id);
    bus.publish('issue-changed', { trainsetId: tsId, issueId: id, status: after.status, devices: after.devices });
    res.status(201).json(after);
  });

  return r;
}
