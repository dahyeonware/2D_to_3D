// /bootstrap 응답 ≒ prototype/index.html 상수, 서버·프론트 그래프 결과 비교 (WORK_ORDER 7.1)
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { makeApp, prototypeConstants } from './helpers.js';
import { buildAdjacency, impact, upstream, upChain, neighbors } from '../../shared/graph.js';

let app, P, boot;
beforeAll(async () => {
  ({ app } = await makeApp());
  P = prototypeConstants();
  boot = (await request(app).get('/api/trainsets/1/bootstrap')).body;
});

// 프로토타입의 statusOf (시뮬레이션 제외)
const SEV = { 정상: 0, 주의: 1, 고장: 2 };
const protoStatusOf = (e) => {
  let st = e.status;
  for (const is of P.ISSUES) if (is.devices.includes(e.id) && SEV[is.severity] > SEV[st]) st = is.severity;
  return st;
};

describe('부트스트랩 동등성', () => {
  it('TRAINSET', () => {
    const { id, ...ts } = boot.trainset;
    expect(id).toBe(1);
    expect(ts).toEqual(P.TRAINSET);
  });

  it('EQUIPMENT (status = 유효 상태, ownStatus = 자체 상태, lastInspection 포함)', () => {
    expect(boot.equipment.map((e) => e.id)).toEqual(P.EQUIPMENT.map((e) => e.id));
    boot.equipment.forEach((e, i) => {
      const p = P.EQUIPMENT[i];
      const { status, ownStatus, ...rest } = e;
      const { status: pStatus, ...pRest } = p;
      expect(rest).toEqual(pRest);
      expect(ownStatus).toBe(pStatus);
      expect(status).toBe(protoStatusOf(p));
    });
  });

  it('CONNECTIONS', () => expect(boot.connections).toEqual(P.CONNECTIONS));
  it('ISSUES', () => expect(boot.issues).toEqual(P.ISSUES));

  it('정비 내역·매뉴얼 (지연 로딩 API)', async () => {
    for (const id of ['PC1-TCMS-01', 'T3-DCU-01', 'T5-PIS-01', 'MC1-CONV-01']) {
      const r = await request(app).get(`/api/trainsets/1/equipment/${id}/maintenance`);
      expect(r.body).toEqual(P.MAINTENANCE[id]);
    }
    for (const [code, m] of Object.entries(P.MANUALS)) {
      const r = await request(app).get(`/api/manuals/by-type/${code}`);
      const { id: _id, typeCode: _t, isVirtual: _v, pdfPath: _p, ...rest } = r.body;
      expect(rest).toEqual(m);
    }
  });
});

describe('그래프 분석', () => {
  it('impact(MC1-CONV-01) = 하위 13개', async () => {
    const { body } = await request(app).get('/api/trainsets/1/graph/impact/MC1-CONV-01');
    expect(body.nodes.length - 1).toBe(13);
  });

  it('upstream(T3-DCU-01): 제어 경로 끝 PC1-TCMS-01, 전원 경로 시작 PC1-PAN-01', async () => {
    const { body } = await request(app).get('/api/trainsets/1/graph/upstream/T3-DCU-01');
    const ctl = body.chains.data.map((n) => n.id);
    const pwr = body.chains.power.map((n) => n.id);
    expect(ctl).toContain('PC1-TCMS-01');
    expect(ctl[0]).toBe('PC1-TCMS-01'); // 최상위(경로의 끝) = TCMS 주제어기
    expect(pwr[0]).toBe('PC1-PAN-01'); // 전원 경로 시작 = 팬터그래프
  });

  it('서버 API 결과 = 프로토타입 데이터로 계산한 프론트 로직 결과', async () => {
    const adj = buildAdjacency(P.EQUIPMENT, P.CONNECTIONS);
    const sorted = (s) => [...s].sort();
    for (const e of P.EQUIPMENT) {
      const imp = (await request(app).get(`/api/trainsets/1/graph/impact/${e.id}`)).body;
      const local = impact(adj, e.id);
      expect(sorted(imp.nodes)).toEqual(sorted(local.nodes));
      expect(sorted(imp.edges)).toEqual(sorted(local.edges));
    }
    for (const id of ['T3-DCU-01', 'PC2-FAN-01', 'T5-PIS-01']) {
      const up = (await request(app).get(`/api/trainsets/1/graph/upstream/${id}`)).body;
      expect(sorted(up.nodes)).toEqual(sorted(upstream(adj, id).nodes));
      expect(up.chains.power.map((n) => n.id)).toEqual(upChain(adj, id, 'power').map((n) => n.id));
    }
    for (const depth of [1, 2, 3]) {
      const nb = (await request(app).get(`/api/trainsets/1/graph/neighbors/PC1-TCMS-01?depth=${depth}&wireless=0`)).body;
      const local = neighbors(adj, 'PC1-TCMS-01', depth, (c) => c.type === 'wired');
      expect(sorted(nb.nodes)).toEqual(sorted(local.nodes));
      expect(sorted(nb.edges)).toEqual(sorted(local.edges));
    }
  });
});
