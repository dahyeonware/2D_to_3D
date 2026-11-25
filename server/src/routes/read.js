// 조회 API (WORK_ORDER 5.1)
import { Router } from 'express';
import { notFound, badRequest, asyncRouter } from '../http.js';
import { counts } from '../integrity.js';

export function readRoutes({ db, data, graph, config }) {
  const r = asyncRouter(Router());

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

  r.get('/health', async (req, res) => {
    const name = db.dialect === 'pg' ? 'postgres' : config.dbPath === ':memory:' ? ':memory:' : config.dbPath.split(/[\\/]/).pop();
    res.json({ ok: true, db: name, counts: await counts(db) });
  });

  r.get('/reference', async (req, res) =>
    res.json({
      ...(await data.reference()),
      app: { demoMode: config.demoMode, writeProtected: !!config.adminKey, realtime: config.realtime },
    }));

  r.get('/trainsets', async (req, res) => res.json(await data.trainsets()));

  // 화면 첫 로딩용 — 프로토타입 상수(TRAINSET, EQUIPMENT, CONNECTIONS, ISSUES)와 같은 형태
  // ISSUES는 '조치 완료'가 아닌 것만 (조치 완료 시 경고·이슈선 해제)
  r.get('/trainsets/:id/bootstrap', async (req, res) => {
    const tsId = await tsParam(req);
    const [trainset, equipment, connections, issues] = await Promise.all([
      data.trainset(tsId), data.equipment(tsId), data.connections(tsId), data.issues(tsId, { open: true }),
    ]);
    res.json({ trainset, equipment, connections, issues });
  });

  // 실시간 갱신용 (상태·최근 점검일·열린 이슈만)
  r.get('/trainsets/:id/live', async (req, res) => res.json(await data.live(await tsParam(req))));

  r.get('/trainsets/:id/equipment', async (req, res) => {
    const tsId = await tsParam(req);
    const { car, status, category } = req.query;
    const qs = String(req.query.q ?? '').trim().toLowerCase();
    let list = await data.equipment(tsId);
    if (car) list = list.filter((e) => e.car === car);
    if (status) list = list.filter((e) => e.status === status);
    if (category) list = list.filter((e) => e.category === category);
    if (qs) list = list.filter((e) => `${e.id} ${e.name} ${e.code}`.toLowerCase().includes(qs));
    res.json(list);
  });

  r.get('/trainsets/:id/equipment/:eqId', async (req, res) => {
    const tsId = await tsParam(req);
    const e = await eqParam(req, tsId);
    res.json({ ...e, connections: await data.connectionsOf(tsId, e.id), maintenanceCount: await data.maintenanceCount(tsId, e.id) });
  });

  r.get('/trainsets/:id/equipment/:eqId/maintenance', async (req, res) => {
    const tsId = await tsParam(req);
    const e = await eqParam(req, tsId);
    const limit = req.query.limit === undefined ? -1 : Number(req.query.limit);
    if (!Number.isInteger(limit) || limit < -1) throw badRequest('limit은 정수여야 합니다');
    res.json(await data.maintenance(tsId, e.id, limit));
  });

  r.get('/trainsets/:id/equipment/:eqId/status-history', async (req, res) => {
    const tsId = await tsParam(req);
    const e = await eqParam(req, tsId);
    res.json(await data.statusHistory(tsId, e.id));
  });

  r.get('/manuals/by-type/:typeCode', async (req, res) => {
    const m = await data.manualByType(req.params.typeCode);
    if (!m) throw notFound(`매뉴얼(${req.params.typeCode})`);
    res.json(m);
  });

  r.get('/fault-codes/:code', async (req, res) => {
    const f = await data.fault(req.params.code);
    if (!f) throw notFound(`고장 코드 ${req.params.code}`);
    res.json({ code: f.code, symptom: f.symptom, action: f.action, typeCode: f.type_code, docNo: f.doc_no });
  });

  r.get('/trainsets/:id/issues', async (req, res) => {
    const tsId = await tsParam(req);
    res.json(await data.issues(tsId, { open: req.query.open === '1' || req.query.open === 'true' }));
  });

  // 그래프 분석
  const flag = (v) => v === undefined || v === '1' || v === 'true';
  r.get('/trainsets/:id/graph/neighbors/:eqId', async (req, res) => {
    const tsId = await tsParam(req);
    const e = await eqParam(req, tsId);
    const depth = Number(req.query.depth ?? 1);
    if (![1, 2, 3].includes(depth)) throw badRequest('depth는 1~3이어야 합니다');
    res.json(await graph.neighbors(tsId, e.id, depth, { wired: flag(req.query.wired), wireless: flag(req.query.wireless) }));
  });
  r.get('/trainsets/:id/graph/impact/:eqId', async (req, res) => {
    const tsId = await tsParam(req);
    res.json(await graph.impact(tsId, (await eqParam(req, tsId)).id));
  });
  r.get('/trainsets/:id/graph/upstream/:eqId', async (req, res) => {
    const tsId = await tsParam(req);
    res.json(await graph.upstream(tsId, (await eqParam(req, tsId)).id));
  });

  r.get('/trainsets/:id/search', async (req, res) => {
    const tsId = await tsParam(req);
    const qs = String(req.query.q ?? '').trim().toLowerCase();
    if (!qs) return res.json([]);
    res.json(
      (await data.equipment(tsId))
        .filter((e) => `${e.id} ${e.name} ${e.code}`.toLowerCase().includes(qs))
        .slice(0, 10)
        .map((e) => ({ id: e.id, name: e.name, code: e.code, category: e.category, car: e.car, status: e.status })),
    );
  });

  return r;
}
