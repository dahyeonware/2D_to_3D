// 조회 쿼리 모음 (모두 매개변수 바인딩) — SQLite·Postgres 공용 SQL
import { trainsetOut, equipmentOut, connectionOut, issueOut, maintenanceOut, manualOut } from '../mappers.js';

const EQ_SELECT = `
  SELECT e.*, t.category, t.dim_l AS t_dim_l, t.dim_w AS t_dim_w, t.dim_h AS t_dim_h,
         c.code AS car_code, s.effective_status, li.last_inspection
  FROM equipment e
  JOIN equipment_types t ON t.code = e.type_code
  LEFT JOIN cars c ON c.id = e.car_id
  JOIN v_equipment_effective_status s ON s.trainset_id = e.trainset_id AND s.equipment_id = e.id
  LEFT JOIN v_last_inspection li ON li.trainset_id = e.trainset_id AND li.equipment_id = e.id`;

const CONN_SELECT = `
  SELECT c.*, p.name AS protocol_name, p.bandwidth, p.layer, p.medium
  FROM connections c JOIN protocols p ON p.code = c.protocol_code`;

export function createData(db) {
  const devicesOf = async (issueId) =>
    (await db.all('SELECT equipment_id FROM issue_devices WHERE issue_id=? ORDER BY seq, equipment_id', [issueId])).map((r) => r.equipment_id);
  const withDevices = async (r) => issueOut(r, await devicesOf(r.id));

  const data = {
    db,
    trainsetExists: async (id) => !!(await db.get('SELECT id FROM trainsets WHERE id=?', [id])),
    trainsets: async () =>
      (await db.all('SELECT * FROM trainsets ORDER BY id')).map((t) => ({ id: t.id, name: t.name, drawingNo: t.drawing_no })),
    async trainset(id) {
      const t = await db.get('SELECT * FROM trainsets WHERE id=?', [id]);
      if (!t) return null;
      const cars = await db.all('SELECT * FROM cars WHERE trainset_id=? ORDER BY seq', [id]);
      const bogies = await db.all('SELECT * FROM bogies WHERE trainset_id=? ORDER BY id', [id]);
      return trainsetOut(t, cars, bogies);
    },
    equipment: async (tsId) => (await db.all(`${EQ_SELECT} WHERE e.trainset_id=? ORDER BY e.seq, e.id`, [tsId])).map(equipmentOut),
    async equipmentOne(tsId, id) {
      const r = await db.get(`${EQ_SELECT} WHERE e.trainset_id=? AND e.id=?`, [tsId, id]);
      return r ? equipmentOut(r) : null;
    },
    connections: async (tsId) => (await db.all(`${CONN_SELECT} WHERE c.trainset_id=? ORDER BY c.seq, c.id`, [tsId])).map(connectionOut),
    connectionsOf: async (tsId, id) =>
      (await db.all(`${CONN_SELECT} WHERE c.trainset_id=? AND (c.from_eq=? OR c.to_eq=?) ORDER BY c.seq, c.id`, [tsId, id, id])).map(connectionOut),
    async connectionBetween(tsId, a, b) {
      const r = await db.get(`SELECT id FROM connections WHERE trainset_id=?
        AND ((from_eq=? AND to_eq=?) OR (from_eq=? AND to_eq=?)) ORDER BY seq, id LIMIT 1`, [tsId, a, b, b, a]);
      return r?.id ?? null;
    },
    async issues(tsId, { open = false } = {}) {
      const rows = await db.all(
        `SELECT * FROM equipment_issues WHERE trainset_id=? ${open ? "AND status<>'조치 완료'" : ''} ORDER BY id`, [tsId]);
      return Promise.all(rows.map(withDevices));
    },
    async issue(tsId, id) {
      const r = await db.get('SELECT * FROM equipment_issues WHERE trainset_id=? AND id=?', [tsId, id]);
      return r ? withDevices(r) : null;
    },
    async maintenance(tsId, eqId, limit = -1) {
      const lim = limit >= 0 ? ` LIMIT ${Number(limit)}` : '';
      return (await db.all(`SELECT * FROM maintenance_records WHERE trainset_id=? AND equipment_id=?
        ORDER BY date DESC, id DESC${lim}`, [tsId, eqId])).map(maintenanceOut);
    },
    maintenanceCount: async (tsId, eqId) =>
      Number((await db.get('SELECT CAST(COUNT(*) AS INTEGER) AS n FROM maintenance_records WHERE trainset_id=? AND equipment_id=?', [tsId, eqId])).n),
    statusHistory: (tsId, eqId) =>
      db.all(`SELECT id, status, source, note, created_by, at FROM status_events
        WHERE trainset_id=? AND equipment_id=? ORDER BY at DESC, id DESC`, [tsId, eqId]),
    async manualByType(type) {
      const m = await db.get('SELECT * FROM manuals WHERE type_code=? AND is_current=1', [type]);
      if (!m) return null;
      const items = await db.all('SELECT * FROM manual_items WHERE manual_id=?', [m.id]);
      const faults = await db.all('SELECT * FROM fault_codes WHERE manual_id=? ORDER BY seq, code', [m.id]);
      return manualOut(m, items, faults);
    },
    fault: async (code) =>
      (await db.get(`SELECT f.*, m.type_code, m.doc_no FROM fault_codes f JOIN manuals m ON m.id=f.manual_id WHERE f.code=?`, [code])) ?? null,
    /** 실시간 갱신용 경량 응답: 장비 상태·최근 점검일 + 열린 장치 간 문제 */
    async live(tsId) {
      const rows = await db.all(`SELECT s.equipment_id AS id, s.own_status, s.effective_status, li.last_inspection
        FROM v_equipment_effective_status s
        LEFT JOIN v_last_inspection li ON li.trainset_id=s.trainset_id AND li.equipment_id=s.equipment_id
        WHERE s.trainset_id=?`, [tsId]);
      return {
        equipment: rows.map((r) => ({ id: r.id, status: r.effective_status, ownStatus: r.own_status, lastInspection: r.last_inspection ?? null })),
        issues: await data.issues(tsId, { open: true }),
      };
    },
    async reference() {
      const types = await db.all('SELECT * FROM equipment_types ORDER BY sort, code');
      return {
        categories: (await db.all('SELECT code, name, color, sort FROM categories ORDER BY sort, code')),
        protocols: (await db.all('SELECT code, name, bandwidth, layer, medium, color FROM protocols ORDER BY sort, code')),
        statuses: [
          { code: '정상', color: '#35d07f' },
          { code: '주의', color: '#f2c94c' },
          { code: '고장', color: '#ff5d5d' },
        ],
        equipmentTypes: types.map((t) => ({
          code: t.code, name: t.name, category: t.category, iconSvg: t.icon_svg, dims: { l: t.dim_l, w: t.dim_w, h: t.dim_h },
        })),
      };
    },
  };
  return data;
}
