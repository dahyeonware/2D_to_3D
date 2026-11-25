// 그래프 분석 — 서버(services/graph.js)와 프론트(web/src)가 같은 코드를 사용한다.
// 프로토타입(index.html)의 neighbors / impact / upstream / upChain / pathOf 로직을 그대로 옮김.
// 연결 방향 규칙: from = 상위(전원·제어를 주는 쪽), to = 하위. redundant = 이중화(장애 영향 분석에서 제외)

export function buildAdjacency(equipment, connections) {
  const adj = new Map(equipment.map((e) => [e.id, []]));
  for (const c of connections) {
    if (!adj.has(c.from) || !adj.has(c.to)) continue;
    adj.get(c.from).push({ c, other: c.to, dir: 'out' });
    adj.get(c.to).push({ c, other: c.from, dir: 'in' });
  }
  return adj;
}

const ALL = () => true;

/** 연결 탐색 (1~3 hop). typeOn(c) = 유선/무선 필터 */
export function neighbors(adj, id, depth, typeOn = ALL) {
  const dist = new Map([[id, 0]]),
    q = [id],
    edges = new Set();
  while (q.length) {
    const u = q.shift(),
      d = dist.get(u);
    if (d >= depth) continue;
    for (const { c, other } of adj.get(u) || []) {
      if (!typeOn(c)) continue;
      if (!dist.has(other)) {
        dist.set(other, d + 1);
        q.push(other);
      }
      if (dist.get(other) >= d) edges.add(c.id);
    }
  }
  return { nodes: new Set(dist.keys()), edges, roots: new Set([id]), dist };
}

/** 장애 영향 (하위 방향, 이중화 링크 제외) */
export function impact(adj, id) {
  const nodes = new Set([id]),
    edges = new Set(),
    q = [id];
  while (q.length) {
    const u = q.shift();
    for (const { c, other, dir } of adj.get(u) || []) {
      if (dir !== 'out' || c.redundant) continue;
      edges.add(c.id);
      if (!nodes.has(other)) {
        nodes.add(other);
        q.push(other);
      }
    }
  }
  return { nodes, edges, roots: new Set([id]) };
}

/** 상위 공급·제어 경로 (상위 방향 전체) */
export function upstream(adj, id) {
  const nodes = new Set([id]),
    edges = new Set(),
    q = [id];
  while (q.length) {
    const u = q.shift();
    for (const { c, other, dir } of adj.get(u) || []) {
      if (dir !== 'in') continue;
      edges.add(c.id);
      if (!nodes.has(other)) {
        nodes.add(other);
        q.push(other);
      }
    }
  }
  return { nodes, edges, roots: new Set([id]) };
}

/** 상위 방향 최단 경로 (layer = 'data' | 'power'). 반환: 최상위 → 선택 장비 직전 */
export function upChain(adj, id, layer) {
  const prev = new Map([[id, null]]),
    q = [id],
    order = [];
  while (q.length) {
    const u = q.shift();
    order.push(u);
    for (const { c, other, dir } of adj.get(u) || []) {
      if (dir !== 'in' || c.layer !== layer || prev.has(other)) continue;
      prev.set(other, { u, c });
      q.push(other);
    }
  }
  const far = order[order.length - 1];
  if (far === id) return [];
  const chain = [];
  let cur = far;
  while (cur !== id) {
    const p = prev.get(cur);
    chain.push({ id: cur, c: p.c });
    cur = p.u;
  }
  return chain;
}

export function pathOf(adj, ids) {
  const nodes = new Set(ids),
    edges = new Set();
  for (let i = 0; i < ids.length - 1; i++) {
    const a = ids[i],
      b = ids[i + 1];
    const hit = (adj.get(a) || []).find((x) => x.other === b);
    if (hit) edges.add(hit.c.id);
  }
  return { nodes, edges, roots: new Set([ids[0]]) };
}

/** 무선 장비 판단용: 직접 무선 연결 또는 동축(COAX)으로 이어진 안테나의 무선 연결 */
export function wirelessLinksOf(adj, id) {
  const out = new Set();
  for (const { c, other } of adj.get(id) || []) {
    if (c.type === 'wireless') out.add(c.id);
    else if (c.protocol === 'COAX') for (const x of adj.get(other) || []) if (x.c.type === 'wireless') out.add(x.c.id);
  }
  return out;
}
