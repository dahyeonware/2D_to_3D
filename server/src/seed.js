// seed/*.json → DB 적재 (WORK_ORDER 4.5). 전체를 하나의 트랜잭션으로 처리, 실패 시 롤백.
// SQLite·Postgres 공용 (db.js 어댑터). 대량 행은 여러 행 INSERT로 묶어 원격 DB에서도 빠르게 적재.
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

const readJson = (dir, name) => JSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), 'utf8'));

async function insertMany(t, table, cols, rows, chunk = 100) {
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk);
    const ph = part.map(() => `(${cols.map(() => '?').join(',')})`).join(',');
    await t.run(`INSERT INTO ${table} (${cols.join(',')}) VALUES ${ph}`, part.flat());
  }
}

export async function seedDatabase(db, seedDir = config.seedDir) {
  const ref = readJson(seedDir, 'reference');
  const ts = readJson(seedDir, 'trainset');
  const equipment = readJson(seedDir, 'equipment');
  const connections = readJson(seedDir, 'connections');
  const manuals = readJson(seedDir, 'manuals');
  const maintenance = readJson(seedDir, 'maintenance');
  const issues = readJson(seedDir, 'issues');

  await db.tx(async (t) => {
    // ----- 기준 정보 -----
    await insertMany(t, 'categories', ['code', 'name', 'color', 'sort'], ref.categories.map((c, i) => [c.code, c.name, c.color, c.sort ?? i]));
    await insertMany(t, 'protocols', ['code', 'name', 'bandwidth', 'layer', 'medium', 'color', 'sort'],
      ref.protocols.map((p, i) => [p.code, p.name, p.bandwidth, p.layer, p.medium, p.color, i]));
    await insertMany(t, 'equipment_types', ['code', 'name', 'category', 'icon_svg', 'dim_l', 'dim_w', 'dim_h', 'sort'],
      ref.equipmentTypes.map((x, i) => [x.code, x.name, x.category, x.iconSvg, x.dims?.l ?? null, x.dims?.w ?? null, x.dims?.h ?? null, i]));

    // ----- 편성·차량·대차 -----
    const tsId = 1;
    await t.run('INSERT INTO trainsets (id,name,drawing_no,total_length,width,height,note) VALUES (?,?,?,?,?,?,?)',
      [tsId, ts.name, ts.drawingNo, ts.totalLength, ts.width, ts.height, ts.note ?? null]);
    const carId = new Map();
    for (const [i, c] of ts.cars.entries()) {
      const r = await t.get('INSERT INTO cars (trainset_id,code,name,type,seq,start_x,length,side) VALUES (?,?,?,?,?,?,?,?) RETURNING id',
        [tsId, c.id, c.name, c.type, i + 1, c.start, c.length, c.side ?? null]);
      carId.set(c.id, Number(r.id));
    }
    await insertMany(t, 'bogies', ['trainset_id', 'car_id', 'x', 'kind'], ts.bogies.map((b) => [tsId, b.car ? carId.get(b.car) : null, b.x, b.kind]));

    // ----- 장비 (lastInspection은 뷰로 계산하므로 저장하지 않음) -----
    await insertMany(t, 'equipment',
      ['id', 'trainset_id', 'car_id', 'type_code', 'idx', 'name', 'zone', 'pos2d_x', 'pos2d_y', 'pos3d_x', 'pos3d_y', 'pos3d_z',
        'dim_l', 'dim_w', 'dim_h', 'manufacturer', 'model', 'install_date', 'status', 'description', 'seq'],
      equipment.map((e, i) => [
        e.id, tsId, e.car === '지상' ? null : carId.get(e.car), e.code, Number(/-(\d+)$/.exec(e.id)?.[1] ?? 1), e.name, e.zone,
        e.pos2d.x, e.pos2d.y, e.pos3d.x, e.pos3d.y, e.pos3d.z, e.dims?.l ?? null, e.dims?.w ?? null, e.dims?.h ?? null,
        e.manufacturer ?? null, e.model ?? null, e.installDate ?? null, e.status ?? '정상', e.description ?? null, i + 1,
      ]), 50);

    // ----- 연결 (type·protocolName·bandwidth·layer는 protocols 조인) -----
    await insertMany(t, 'connections',
      ['id', 'trainset_id', 'from_eq', 'to_eq', 'protocol_code', 'direction', 'redundant', 'cable_id', 'channel', 'description', 'seq'],
      connections.map((c, i) => [c.id, tsId, c.from, c.to, c.protocol, c.direction ?? 'downstream', c.redundant ? 1 : 0,
        c.cableId ?? null, c.channel ?? null, c.description ?? null, i + 1]));

    // ----- 매뉴얼 -----
    const items = [], faults = [];
    for (const [type, m] of Object.entries(manuals)) {
      const r = await t.get('INSERT INTO manuals (type_code,doc_no,rev,title,is_current,is_virtual) VALUES (?,?,?,?,1,1) RETURNING id',
        [type, m.docNo, m.rev, m.title]);
      const id = Number(r.id);
      const kinds = { interval: m.interval, safety: m.safety, step: m.steps, tool: m.tools };
      for (const [kind, arr] of Object.entries(kinds)) (arr ?? []).forEach((x, i) => items.push([id, kind, i + 1, x]));
      for (const f of m.faults ?? []) faults.push([f.code, id, f.symptom, f.action, faults.length + 1]);
    }
    await insertMany(t, 'manual_items', ['manual_id', 'kind', 'seq', 'text'], items);
    await insertMany(t, 'fault_codes', ['code', 'manual_id', 'symptom', 'action', 'seq'], faults);

    // ----- 정비 내역 -----
    const recs = [];
    for (const [eqId, list] of Object.entries(maintenance))
      for (const r of list)
        recs.push([r.id, tsId, eqId, r.date, r.type, r.team ?? null, r.hours ?? null, r.summary, r.parts ?? null, r.result, r.faultCode ?? null]);
    await insertMany(t, 'maintenance_records',
      ['id', 'trainset_id', 'equipment_id', 'date', 'type', 'team', 'hours', 'summary', 'parts', 'result', 'fault_code'], recs);

    // ----- 장치 간 문제 -----
    for (const is of issues) {
      await t.run(`INSERT INTO equipment_issues
        (id,trainset_id,title,type,severity,cause,evidence,action,status,connection_id,since,closed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [is.id, tsId, is.title, is.type, is.severity, is.cause ?? null, is.evidence ?? null, is.action ?? null,
          is.status ?? '조치 예정', is.connection ?? null, is.since, is.status === '조치 완료' ? is.since : null]);
      await insertMany(t, 'issue_devices', ['issue_id', 'trainset_id', 'equipment_id', 'seq'], is.devices.map((d, i) => [is.id, tsId, d, i + 1]));
    }
  });
}
