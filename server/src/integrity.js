// 무결성 검사 (WORK_ORDER 7.2) — SQLite·Postgres 공용
export const EXPECTED = { equipment: 105, connections: 131, issues: 2, maintenance: 416, manuals: 27 };

const n = async (db, sql) => Number((await db.get(`SELECT CAST(COUNT(*) AS INTEGER) AS n FROM ${sql}`)).n);

export async function counts(db) {
  return {
    equipment: await n(db, 'equipment'),
    connections: await n(db, 'connections'),
    issues: await n(db, 'equipment_issues'),
    maintenance: await n(db, 'maintenance_records'),
    manuals: await n(db, 'manuals'),
  };
}

export async function checkIntegrity(db, { expectSeedCounts = true } = {}) {
  const errors = [];
  if (db.dialect === 'sqlite') { // Postgres는 외래키를 항상 강제하므로 생략
    const fk = await db.all('PRAGMA foreign_key_check');
    if (fk.length) errors.push(`foreign_key_check 위반 ${fk.length}건: ${JSON.stringify(fk.slice(0, 5))}`);
  }

  const badConn = await db.all(`SELECT c.id FROM connections c
    LEFT JOIN equipment a ON a.trainset_id=c.trainset_id AND a.id=c.from_eq
    LEFT JOIN equipment b ON b.trainset_id=c.trainset_id AND b.id=c.to_eq
    WHERE a.id IS NULL OR b.id IS NULL OR c.from_eq=c.to_eq`);
  if (badConn.length) errors.push(`연결 끝점 누락/자기 연결: ${badConn.map((r) => r.id).join(', ')}`);

  const badDev = await db.all(`SELECT i.id, CAST(COUNT(d.equipment_id) AS INTEGER) AS n FROM equipment_issues i
    LEFT JOIN issue_devices d ON d.issue_id=i.id GROUP BY i.id HAVING COUNT(d.equipment_id)<>2`);
  if (badDev.length) errors.push(`issue_devices가 2행이 아닌 이슈: ${badDev.map((r) => `${r.id}(${r.n})`).join(', ')}`);

  const withConn = await db.all(`SELECT i.id, i.connection_id, c.from_eq, c.to_eq FROM equipment_issues i
    LEFT JOIN connections c ON c.trainset_id=i.trainset_id AND c.id=i.connection_id
    WHERE i.connection_id IS NOT NULL`);
  for (const r of withConn) {
    const devs = new Set((await db.all('SELECT equipment_id FROM issue_devices WHERE issue_id=?', [r.id])).map((x) => x.equipment_id));
    if (!r.from_eq || !devs.has(r.from_eq) || !devs.has(r.to_eq) || devs.size !== 2)
      errors.push(`이슈 ${r.id}: 연결 ${r.connection_id}의 양 끝이 이슈 장비와 다름`);
  }

  const badFault = await db.all(`SELECT m.id, m.fault_code FROM maintenance_records m
    JOIN equipment e ON e.trainset_id=m.trainset_id AND e.id=m.equipment_id
    LEFT JOIN fault_codes f ON f.code=m.fault_code
    LEFT JOIN manuals mn ON mn.id=f.manual_id
    WHERE m.fault_code IS NOT NULL AND (f.code IS NULL OR mn.type_code<>e.type_code)`);
  if (badFault.length) errors.push(`장비 종류와 맞지 않는 고장 코드: ${badFault.map((r) => `${r.id}→${r.fault_code}`).join(', ')}`);

  const c = await counts(db);
  if (expectSeedCounts)
    for (const [k, v] of Object.entries(EXPECTED)) if (c[k] !== v) errors.push(`건수 불일치 ${k}: 기대 ${v}, 실제 ${c[k]}`);

  return { ok: errors.length === 0, errors, counts: c };
}
