// DB 행(snake_case) ↔ API 응답(camelCase, 프로토타입 상수와 같은 형식)

export function trainsetOut(t, cars, bogies) {
  const carCode = new Map(cars.map((c) => [c.id, c.code]));
  return {
    id: t.id,
    name: t.name,
    drawingNo: t.drawing_no,
    totalLength: t.total_length,
    width: t.width,
    height: t.height,
    cars: cars.map((c) => ({ id: c.code, name: c.name, type: c.type, length: c.length, start: c.start_x, side: c.side })),
    bogies: bogies.map((b) => ({ x: b.x, kind: b.kind, car: b.car_id ? carCode.get(b.car_id) : null })),
    note: t.note,
  };
}

/** equipment 행 (v_equipment_effective_status, v_last_inspection, equipment_types, cars 조인 결과) */
export function equipmentOut(r) {
  return {
    id: r.id,
    code: r.type_code,
    name: r.name,
    category: r.category,
    car: r.car_code ?? '지상',
    zone: r.zone,
    pos2d: { x: r.pos2d_x, y: r.pos2d_y },
    pos3d: { x: r.pos3d_x, y: r.pos3d_y, z: r.pos3d_z },
    dims: { l: r.dim_l ?? r.t_dim_l, w: r.dim_w ?? r.t_dim_w, h: r.dim_h ?? r.t_dim_h },
    manufacturer: r.manufacturer,
    model: r.model,
    installDate: r.install_date,
    status: r.effective_status ?? r.status, // 유효 상태 (장치 간 문제 반영)
    ownStatus: r.status, // 장비 자체 상태
    lastInspection: r.last_inspection ?? null,
    description: r.description,
  };
}

/** connections 행 (protocols 조인) — 프로토타입과 같이 cableId/channel/redundant는 값이 있을 때만 포함 */
export function connectionOut(r) {
  const o = {
    id: r.id,
    from: r.from_eq,
    to: r.to_eq,
    type: r.medium,
    protocol: r.protocol_code,
    protocolName: r.protocol_name,
    bandwidth: r.bandwidth,
    layer: r.layer,
    description: r.description,
    direction: r.direction,
  };
  if (r.cable_id != null) o.cableId = r.cable_id;
  if (r.channel != null) o.channel = r.channel;
  if (r.redundant) o.redundant = true;
  return o;
}

export function issueOut(r, devices) {
  return {
    id: r.id,
    devices,
    connection: r.connection_id,
    type: r.type,
    severity: r.severity,
    title: r.title,
    cause: r.cause,
    evidence: r.evidence,
    since: r.since,
    status: r.status,
    action: r.action,
    ...(r.closed_at ? { closedAt: r.closed_at } : {}),
  };
}

export function maintenanceOut(r) {
  const o = {
    date: r.date,
    type: r.type,
    team: r.team,
    hours: r.hours,
    summary: r.summary,
    parts: r.parts,
    result: r.result,
    id: r.id,
  };
  if (r.fault_code) o.faultCode = r.fault_code;
  return o;
}

export function manualOut(m, items, faults) {
  const by = (k) => items.filter((i) => i.kind === k).sort((a, b) => a.seq - b.seq).map((i) => i.text);
  return {
    id: m.id,
    typeCode: m.type_code,
    docNo: m.doc_no,
    rev: m.rev,
    title: m.title,
    isVirtual: !!m.is_virtual,
    pdfPath: m.pdf_path,
    interval: by('interval'),
    safety: by('safety'),
    steps: by('step'),
    tools: by('tool'),
    faults: faults.map((f) => ({ code: f.code, symptom: f.symptom, action: f.action })),
  };
}
