// 선택·모드·필터·이력 상태 + 상태/가시성 판정 + 좌표 변환
import * as G from '../../shared/graph.js';
import { CATS, EQ, ADJ, ISSUE_BY_DEV } from './data.js';

export const state = {
  selected: null, mode: 'none', depth: 1, view: 'plan',
  cats: new Set(), car: 'ALL', status: 'ALL', wired: true, wireless: true,
  hl: null, // {nodes:Set, edges:Set, roots:Set}
  tab: 'info', expanded: null, showRange: false, history: [], forward: [], // 연결 목록에서 펼친 장비 (1단계)
  simFault: new Set(), scenario: null, pathLabel: '',
  form: null, // 패널에서 열린 입력 폼 ('maint' | 'status')
};
export function initState() {
  state.cats = new Set(Object.keys(CATS));
}

export const SEV = { 정상: 0, 주의: 1, 고장: 2 };
export const ISSUE_COLOR = { 주의: '#ff9f43', 고장: '#ff4d4d' };

// 장비 상태 = 서버가 계산한 유효 상태(장비 자체 상태 + 열린 장치 간 문제), 고장 시뮬레이션(클라이언트 전용)이면 '고장'
export const statusOf = (e) => (state.simFault.has(e.id) ? '고장' : e.status);
// 장비 자체 상태 (원인 박스 표시용)
export const ownStatusOf = (e) => e.ownStatus ?? e.status;
export const issuesOf = (id) => ISSUE_BY_DEV.get(id) || [];

export const eqVisible = (e) =>
  state.cats.has(e.category) &&
  (state.car === 'ALL' || e.car === state.car || e.car === '지상') &&
  (state.status === 'ALL' || statusOf(e) === state.status);
export const connTypeOn = (c) => (c.type === 'wired' ? state.wired : state.wireless);
export const connVisible = (c) => connTypeOn(c) && eqVisible(EQ.get(c.from)) && eqVisible(EQ.get(c.to));

/* 그래프 탐색 (shared/graph.js — 서버 API와 같은 로직) */
export const neighbors = (id, depth) => G.neighbors(ADJ, id, depth, connTypeOn);
export const impact = (id) => G.impact(ADJ, id);
export const upstream = (id) => G.upstream(ADJ, id);
export const upChain = (id, layer) => G.upChain(ADJ, id, layer);
export const pathOf = (ids) => G.pathOf(ADJ, ids);
export const wirelessLinksOf = (id) => G.wirelessLinksOf(ADJ, id);
export const isWirelessDevice = (id) => EQ.get(id).code === 'WIFI' || wirelessLinksOf(id).size > 0;

/* 2D ↔ 3D 좌표 변환 (동일 기준: x = 편성 길이 방향, PC1 앞단 = 0) */
export const SX = 14; // px / m (길이 방향)
export const SY = { plan: 82, side: 58 }; // px / m (평면: 횡방향 과장 표시, 측면: 높이)
export const Coord = {
  to2D(e, view) {
    return view === 'plan'
      ? { x: e.pos2d.x * SX, y: e.pos2d.y * SY.plan }
      : { x: e.pos3d.x * SX, y: -Math.min(e.pos3d.y, 6.2) * SY.side };
  },
  from2D(px, py, view) {
    return view === 'plan' ? { x: px / SX, lat: py / SY.plan } : { x: px / SX, h: -py / SY.side };
  },
};
export const DIM = (e) => [e.dims.l, e.dims.h, e.dims.w]; // 3D 박스 [x, y, z]
