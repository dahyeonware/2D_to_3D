// 서버에서 받은 데이터 (프로토타입의 하드코딩 상수를 대체). ES 모듈 live binding으로 다른 모듈에서 읽음.
import { api } from './api.js';
import { buildAdjacency } from '../../shared/graph.js';

export let TS_ID = 1;
export let APP = { demoMode: true };
export let TRAINSET, EQUIPMENT, CONNECTIONS, ISSUES;
export let CARS, CARMAP, EQ, CONN, ADJ;
export let CATS, PROTO, STATUS_COLOR, ICON, ICON_NAME;
export const ISSUE_BY_DEV = new Map(),
  ISSUE_BY_CONN = new Map();

// 지연 로딩 캐시 (장비 선택 시 불러옴)
export const MAINTENANCE = {}; // eqId → 정비 내역 (최신순)
export const MANUALS = {}; // typeCode → 매뉴얼
export const STATUS_HIST = {}; // eqId → 상태 이력

// 분류별 2D 심볼 모양 (화면 표현용, DB에는 색만 저장)
const SHAPE = { 제어: 'rect', '추진·전력': 'tri', '제동·주행': 'diamond', '신호·무선': 'circle', 승객서비스: 'square', 지상설비: 'hex' };

function setReference(ref) {
  APP = ref.app ?? APP;
  CATS = Object.fromEntries(ref.categories.map((c) => [c.code, { color: c.color, shape: SHAPE[c.code] ?? 'circle' }]));
  PROTO = Object.fromEntries(ref.protocols.map((p) => [p.code, { color: p.color, name: p.name }]));
  STATUS_COLOR = Object.fromEntries(ref.statuses.map((s) => [s.code, s.color]));
  ICON = Object.fromEntries(ref.equipmentTypes.map((t) => [t.code, t.iconSvg]));
  ICON_NAME = Object.fromEntries(ref.equipmentTypes.map((t) => [t.code, t.name]));
}

function indexIssues() {
  ISSUE_BY_DEV.clear();
  ISSUE_BY_CONN.clear();
  for (const is of ISSUES) {
    for (const d of is.devices) {
      if (!ISSUE_BY_DEV.has(d)) ISSUE_BY_DEV.set(d, []);
      ISSUE_BY_DEV.get(d).push(is);
    }
    if (is.connection) ISSUE_BY_CONN.set(is.connection, is);
  }
}

function setBootstrap(b) {
  TRAINSET = b.trainset;
  EQUIPMENT = b.equipment;
  CONNECTIONS = b.connections;
  ISSUES = b.issues;
  CARS = TRAINSET.cars;
  CARMAP = Object.fromEntries(CARS.map((c) => [c.id, c]));
  EQ = new Map(EQUIPMENT.map((e) => [e.id, e]));
  CONN = new Map(CONNECTIONS.map((c) => [c.id, c]));
  ADJ = buildAdjacency(EQUIPMENT, CONNECTIONS);
  indexIssues();
}

export async function loadAll() {
  const list = await api.trainsets();
  if (list?.length) TS_ID = list[0].id; // 다중 편성(P1-9) 전까지는 첫 편성
  const [ref, boot] = await Promise.all([api.reference(), api.bootstrap(TS_ID)]);
  setReference(ref);
  setBootstrap(boot);
}

/**
 * 상태·이슈·최근 점검일만 다시 받아 기존 객체에 반영 (쓰기 후 / SSE 수신 시).
 * 장비·연결 구성 자체는 바뀌지 않는다고 가정 (구성 변경은 관리 화면 P1-1 범위).
 * 반환: 이슈 목록이 바뀌었는지
 */
export async function reloadLive() {
  const b = await api.live(TS_ID);
  const changedIds = [];
  for (const n of b.equipment) {
    const e = EQ.get(n.id);
    if (!e) continue;
    if (e.status !== n.status || e.ownStatus !== n.ownStatus || e.lastInspection !== n.lastInspection) changedIds.push(n.id);
    Object.assign(e, { status: n.status, ownStatus: n.ownStatus, lastInspection: n.lastInspection });
  }
  const before = JSON.stringify(ISSUES);
  ISSUES = b.issues;
  indexIssues();
  const issuesChanged = before !== JSON.stringify(ISSUES);
  return { issuesChanged, changedIds, changed: issuesChanged || changedIds.length > 0 };
}

/** 정비 내역·매뉴얼 지연 로딩 */
const pending = new Map(); // 같은 장비에 대한 중복 요청 방지
export function ensureDetail(e, { force = false } = {}) {
  if (!force && pending.has(e.id)) return pending.get(e.id);
  const p = loadDetail(e, force).finally(() => pending.delete(e.id));
  pending.set(e.id, p);
  return p;
}
async function loadDetail(e, force) {
  const jobs = [];
  if (force || !MAINTENANCE[e.id]) jobs.push(api.maintenance(TS_ID, e.id).then((r) => (MAINTENANCE[e.id] = r)));
  if (!(e.code in MANUALS))
    jobs.push(api.manual(e.code).then((m) => (MANUALS[e.code] = m), () => (MANUALS[e.code] = null)));
  if (force || !STATUS_HIST[e.id]) jobs.push(api.statusHistory(TS_ID, e.id).then((r) => (STATUS_HIST[e.id] = r)));
  await Promise.all(jobs);
}
export const detailLoaded = (e) => !!MAINTENANCE[e.id] && e.code in MANUALS;
export function invalidateDetail(id) {
  delete MAINTENANCE[id];
  delete STATUS_HIST[id];
}
