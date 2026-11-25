// 앱 컨트롤러: 선택·모드·이력, 필터·범례·검색, 창 분할, 데모 시나리오, 쓰기 후 갱신, 실시간(SSE)
import { EQUIPMENT, CONNECTIONS, ISSUES, CARS, CARMAP, EQ, ADJ, CATS, PROTO, ICON_NAME, APP, reloadLive, invalidateDetail } from './data.js';
import { state, connTypeOn, neighbors, impact, upstream, pathOf } from './state.js';
import { iconSVG, iconOf } from './icons.js';
import { $, esc, toast } from './ui.js';
import { style2D, pan2DTo, pan2DToX, pan2DToSet, home2D, buildIssues2D } from './view2d/index.js';
import { style3D, focusEq, focusCar, focusAll, focusSet, buildIssues3D, updateRangeBtn } from './view3d/index.js';
import { renderPanel } from './panel/index.js';

/* ================= 선택·모드 ================= */
export function recomputeHL() {
  const id = state.selected;
  if (state.mode === 'neighbors' && id) state.hl = neighbors(id, state.depth);
  else if (state.mode === 'impact' && id) state.hl = impact(id);
  else if (state.mode === 'upstream' && id) state.hl = upstream(id);
  else if (state.mode === 'path' || state.mode === 'issues') { /* 유지 */ }
  else state.hl = null;
  // 연결 목록에서 펼친 장비의 직접 연결도 함께 강조
  if (state.expanded && state.hl && state.mode !== 'path') {
    state.hl.nodes.add(state.expanded);
    for (const { c, other } of ADJ.get(state.expanded)) { if (!connTypeOn(c)) continue; state.hl.nodes.add(other); state.hl.edges.add(c.id); }
  }
}
let restoring = false;
const snap = () => ({ id: state.selected, mode: state.mode, scenario: state.scenario, tab: state.tab, expanded: state.expanded, depth: state.depth, sim: [...state.simFault] });
function pushHistory() {
  if (restoring || !state.selected) return;
  state.history.push(snap()); if (state.history.length > 30) state.history.shift();
  state.forward = []; // 새 장비로 이동하면 앞으로 가기 기록은 비움
}
export function goBack() { const h = state.history.pop(); if (!h) return; state.forward.push(snap()); restoreSnap(h); }
export function goForward() { const h = state.forward.pop(); if (!h) return; state.history.push(snap()); restoreSnap(h); }
function restoreSnap(h) {
  restoring = true;
  setDepth(h.depth); state.simFault = new Set(h.sim);
  if (h.scenario === 3) SCEN[3](); else select(h.id, { mode: h.mode });
  state.scenario = h.scenario; markScen();
  state.tab = h.tab; state.expanded = h.expanded; recomputeHL(); refresh();
  restoring = false;
}
export function select(id, { from = '', mode = 'neighbors', fly = true } = {}) {
  if (state.selected !== id) { pushHistory(); state.form = null; }
  state.showRange = false;
  state.selected = id; state.mode = mode; state.expanded = null; if (from) { state.scenario = null; markScen(); }
  recomputeHL(); refresh();
  if (fly) { if ((mode === 'neighbors' && state.depth === 1) || from) focusEq(id); else focusSet(state.hl.nodes); }
  if (from !== '2d' || mode !== 'neighbors') { if (mode === 'neighbors' && state.depth === 1) pan2DTo(id); else pan2DToSet(state.hl.nodes); }
}
export function setMode(mode) { if (!state.selected) return; state.mode = mode; state.expanded = null; recomputeHL(); refresh(); focusSet(state.hl.nodes); pan2DToSet(state.hl.nodes); }
export function resetAll() {
  state.selected = null; state.mode = 'none'; state.expanded = null; state.showRange = false; state.history = []; state.forward = []; state.hl = null; state.simFault.clear(); state.scenario = null; state.form = null; markScen();
  refresh(); focusAll(); home2D();
}

function banner() {
  const b = $('#banner'); b.classList.remove('bad', 'issue');
  if (!state.hl) { b.classList.remove('on'); return; }
  let t = '';
  if (state.mode === 'neighbors') t = `연결 탐색 · 깊이 ${state.depth}-hop · 장비 ${state.hl.nodes.size}개 · 연결 ${state.hl.edges.size}개`;
  if (state.mode === 'impact') { const cars = new Set([...state.hl.nodes].map((i) => EQ.get(i).car)); t = `장애 영향 분석 · 영향 장비 ${state.hl.nodes.size - 1}개 · 영향 차량 ${cars.size}량`; b.classList.add('bad'); }
  if (state.mode === 'upstream') t = `상위 제어·전원 경로 추적 · 경로상 장비 ${state.hl.nodes.size}개`;
  if (state.mode === 'path') t = state.pathLabel || '경로 표시';
  if (state.mode === 'issues') { const d = ISSUES.filter((i) => i.connection).length; t = `장치 간 문제 ${ISSUES.length}건 · 직접 연결 ${d}건(연결선 깜빡임) · 직접 연결 없음 ${ISSUES.length - d}건(이슈선)`; b.classList.add('issue'); }
  b.textContent = t; b.classList.add('on');
}

export function refresh() { style2D(); style3D(); renderPanel(); banner(); updateRangeBtn(); }

/* ================= 쓰기 후 / 실시간 변경 반영 ================= */
export async function afterWrite({ onlyIfChanged = false } = {}) {
  const { issuesChanged, changedIds, changed } = await reloadLive();
  if (onlyIfChanged && !changed) return; // 폴링: 바뀐 것이 없으면 다시 그리지 않음
  for (const id of changedIds) invalidateDetail(id); // 다른 사용자가 바꾼 장비의 정비 내역·이력은 다시 받기
  if (issuesChanged) {
    buildIssues2D(); buildIssues3D();
    if (state.mode === 'issues') { // 시나리오 5 강조 대상도 갱신
      const nodes = new Set(ISSUES.flatMap((i) => i.devices)), edges = new Set(ISSUES.filter((i) => i.connection).map((i) => i.connection));
      state.hl = nodes.size ? { nodes, edges, roots: new Set(nodes) } : null;
      if (!nodes.size) state.mode = 'none';
    }
  }
  refresh();
}

// 서버리스 배포(Vercel)는 SSE 연결을 유지할 수 없어 15초마다 /live 를 확인 (탭이 보일 때만)
function startPolling() {
  const live = $('#live');
  live.classList.add('on');
  live.title = '실시간 반영: 15초마다 변경 확인';
  setInterval(() => {
    if (document.hidden || state.form) return; // 입력 중에는 건너뜀
    afterWrite({ onlyIfChanged: true }).catch(() => live.classList.remove('on'));
  }, 15000);
}

function connectEvents() {
  if (APP.realtime === 'poll' || !('EventSource' in window)) return startPolling();
  const live = $('#live');
  const es = new EventSource('/api/events');
  es.onopen = () => live.classList.add('on');
  es.onerror = () => live.classList.remove('on');
  let timer = null;
  const onChange = (ev) => {
    try {
      const d = JSON.parse(ev.data);
      if (d.equipmentId) invalidateDetail(d.equipmentId);
    } catch { /* 무시 */ }
    clearTimeout(timer);
    timer = setTimeout(() => afterWrite().catch(() => {}), 150); // 여러 이벤트를 한 번에 반영
  };
  for (const t of ['status-changed', 'issue-changed', 'maintenance-added']) es.addEventListener(t, onChange);
}

/* ================= 필터·범례·키보드 ================= */
function initControls() {
  $('#fCar').innerHTML = '<option value="ALL">전체 편성</option>' + CARS.map((c) => `<option value="${c.id}">${c.id} · ${c.name}</option>`).join('');
  $('#fCats').innerHTML = Object.entries(CATS).filter(([k]) => k !== '지상설비').map(([k, v]) => `<button class="chip on" data-cat="${k}"><i style="background:${v.color}"></i>${k}</button>`).join('');
  $('#fCats').addEventListener('click', (ev) => {
    const b = ev.target.closest('.chip'); if (!b) return;
    const k = b.dataset.cat; if (state.cats.has(k)) state.cats.delete(k); else state.cats.add(k); b.classList.toggle('on'); refresh();
  });
  $('#fCar').onchange = (e) => { state.car = e.target.value; refresh(); if (state.car !== 'ALL') { focusCar(state.car); pan2DToX(CARMAP[state.car].start + CARMAP[state.car].length / 2); } };
  $('#fStatus').onchange = (e) => { state.status = e.target.value; refresh(); };
  $('#tWired').onclick = (e) => { state.wired = !state.wired; e.currentTarget.classList.toggle('on', state.wired); recomputeHL(); refresh(); };
  $('#tWireless').onclick = (e) => { state.wireless = !state.wireless; e.currentTarget.classList.toggle('on', state.wireless); recomputeHL(); refresh(); };
  $('#depth').oninput = (e) => { state.depth = +e.target.value; $('#depthOut').textContent = state.depth + '-hop'; if (state.selected && state.mode === 'neighbors') { recomputeHL(); refresh(); } };
  $('#btnLegend').onclick = () => $('#legend').classList.toggle('hidden');
  $('#btnReset').onclick = () => resetAll();
  $('#manClose').onclick = () => $('#manual').classList.remove('open');
  $('#manual').addEventListener('click', (e) => { if (e.target.id === 'manual') $('#manual').classList.remove('open'); });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || document.activeElement === $('#search')) return;
    if ($('#keyModal').classList.contains('open')) { $('#keyModal [data-cancel]').click(); return; }
    if ($('#manual').classList.contains('open')) { $('#manual').classList.remove('open'); return; }
    if (e.target.closest && e.target.closest('form')) { state.form = null; renderPanel(); return; }
    resetAll();
  });

  // 범례
  const used = new Set(CONNECTIONS.map((c) => c.protocol));
  const pn = Object.fromEntries(CONNECTIONS.map((c) => [c.protocol, c.protocolName]));
  let h = '<div class="ttl">장비 분류 (아이콘 색상)</div>';
  for (const [k, v] of Object.entries(CATS)) h += `<span><i style="background:${v.color};width:10px;height:10px"></i>${k}</span>`;
  h += '<div class="ttl">장비 도면 아이콘</div><div class="icongrid">';
  const codeCat = Object.fromEntries(EQUIPMENT.map((e) => [e.code, e.category]));
  for (const [code, nm] of Object.entries(ICON_NAME)) if (codeCat[code]) h += `<span>${iconSVG(code, CATS[codeCat[code]].color, 15)}${esc(nm)}</span>`;
  h += '</div>';
  h += '<div class="ttl">연결 (실선=유선, 점선=무선)</div>';
  for (const p of Object.keys(PROTO)) if (used.has(p)) {
    const wl = CONNECTIONS.find((c) => c.protocol === p)?.type === 'wireless';
    h += `<span><i class="${wl ? 'dash' : ''}" style="background:${PROTO[p].color};border-color:${PROTO[p].color}"></i>${esc(pn[p])}</span>`;
  }
  h += '<div class="ttl">흐르는 빛 = 연결 방향 (상위 → 하위, 양방향 연결은 양쪽으로), 속도 동일</div>';
  h += '<div class="ttl">퍼지는 파동 = 무선 송신(LTE-R·BLE·발리스) / Wi-Fi 서비스 영역 · 무선 장비 선택 후 [무선 범위 보기]로 표시</div>';
  h += `<div class="ttl">장치 간 문제</div><span><i class="dash" style="border-color:#ff9f43"></i>직접 연결: 연결선 깜빡임</span><span><i class="dash" style="border-color:#ff9f43"></i>연결 없음: 주황 이슈선</span>`;
  h += '<div class="ttl">상태 표시</div><span><svg width="16" height="16" viewBox="-9 -9 18 18"><path d="M0 -7.5L7.6 5.5H-7.6Z" fill="#ff5d5d"/><path d="M0 -3v4" stroke="#08162e" stroke-width="1.9" stroke-linecap="round"/><circle cy="3.4" r="1" fill="#08162e"/></svg>고장</span><span><svg width="16" height="16" viewBox="-8 -8 16 16"><circle r="6.4" fill="#f2c94c"/><path d="M0 -4v4.4" stroke="#08162e" stroke-width="1.9" stroke-linecap="round"/><circle cy="2.6" r="1" fill="#08162e"/></svg>주의</span>';
  $('#legend').innerHTML = h;
}

/* ================= 창 크기 조절 (분할선 드래그, 브라우저 저장) ================= */
function initLayout() {
  const mainEl = document.querySelector('.main');
  const LAYOUT = { min2d: 300, min3d: 360, minP: 280, maxP: 620 };
  const lay = { w2d: 0, wp: 340 };
  const layoutDefault = () => { const W = mainEl.clientWidth; lay.wp = 340; lay.w2d = Math.round((W - lay.wp - 14) * 0.45); };
  const layoutClamp = () => {
    const W = mainEl.clientWidth;
    lay.wp = Math.max(LAYOUT.minP, Math.min(LAYOUT.maxP, lay.wp, W - 14 - LAYOUT.min2d - LAYOUT.min3d));
    lay.w2d = Math.max(LAYOUT.min2d, Math.min(lay.w2d, W - 14 - lay.wp - LAYOUT.min3d));
    mainEl.style.setProperty('--w2d', lay.w2d + 'px'); mainEl.style.setProperty('--wp', lay.wp + 'px');
  };
  try { const sv = JSON.parse(localStorage.getItem('ktx-layout') || 'null'); if (sv && sv.w2d) { lay.w2d = sv.w2d; lay.wp = sv.wp; } else layoutDefault(); } catch { layoutDefault(); }
  layoutClamp();
  const saveLayout = () => { try { localStorage.setItem('ktx-layout', JSON.stringify(lay)); } catch { /* 저장 불가 */ } };
  document.querySelectorAll('.gutter').forEach((g) => {
    g.addEventListener('pointerdown', (e) => {
      e.preventDefault(); g.setPointerCapture(e.pointerId); g.classList.add('drag'); document.body.classList.add('resizing');
      const r = mainEl.getBoundingClientRect();
      const move = (ev) => { if (g.dataset.g === '1') lay.w2d = ev.clientX - r.left - 3; else lay.wp = r.right - ev.clientX - 3; layoutClamp(); };
      const up = () => { g.classList.remove('drag'); document.body.classList.remove('resizing'); g.removeEventListener('pointermove', move); g.removeEventListener('pointerup', up); saveLayout(); };
      g.addEventListener('pointermove', move); g.addEventListener('pointerup', up);
    });
    g.addEventListener('dblclick', () => { layoutDefault(); layoutClamp(); saveLayout(); });
  });
  addEventListener('resize', layoutClamp);
}

/* ================= 검색 ================= */
function initSearch() {
  const sIn = $('#search'), sRes = $('#results'); let sIdx = 0, sItems = [];
  function doSearch() {
    const q = sIn.value.trim().toLowerCase(); if (!q) { sRes.classList.remove('open'); return; }
    sItems = EQUIPMENT.filter((e) => (e.id + ' ' + e.name + ' ' + e.code).toLowerCase().includes(q)).slice(0, 10); sIdx = 0;
    sRes.innerHTML = sItems.length ? sItems.map((e, i) => `<div data-id="${e.id}" class="${i === 0 ? 'on' : ''}">${iconOf(e)}<code>${e.id}</code>${esc(e.name)}</div>`).join('') : '<div style="color:#7f92b8;cursor:default">결과 없음</div>';
    sRes.classList.add('open');
  }
  sIn.addEventListener('input', doSearch); sIn.addEventListener('focus', doSearch);
  sIn.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sIdx = (sIdx + (e.key === 'ArrowDown' ? 1 : -1) + sItems.length) % Math.max(1, sItems.length); [...sRes.children].forEach((d, i) => d.classList.toggle('on', i === sIdx)); }
    if (e.key === 'Enter' && sItems[sIdx]) { select(sItems[sIdx].id, { from: 'search' }); sRes.classList.remove('open'); sIn.blur(); }
    if (e.key === 'Escape') { sRes.classList.remove('open'); sIn.blur(); }
  });
  sRes.addEventListener('mousedown', (e) => { const d = e.target.closest('[data-id]'); if (d) { select(d.dataset.id, { from: 'search' }); sRes.classList.remove('open'); sIn.value = ''; } });
  sIn.addEventListener('blur', () => setTimeout(() => sRes.classList.remove('open'), 120));
}

/* ================= 데모 시나리오 ================= */
function markScen() { document.querySelectorAll('.scen').forEach((b) => b.classList.toggle('on', +b.dataset.s === state.scenario)); }
function setDepth(d) { state.depth = d; $('#depth').value = d; $('#depthOut').textContent = d + '-hop'; }
const SCEN = {
  1() { state.simFault.clear(); setDepth(3); select('PC1-TCMS-01', { mode: 'neighbors' }); },
  2() { state.simFault.clear(); state.simFault.add('MC1-CONV-01'); select('MC1-CONV-01', { mode: 'impact' }); },
  3() {
    if (state.selected !== 'PC1-LTE-01') pushHistory(); state.showRange = false; state.simFault.clear(); state.selected = 'PC1-LTE-01'; state.mode = 'path'; state.expanded = null; state.form = null;
    state.hl = pathOf(['WAY-LTEBS-01', 'PC1-ANT-01', 'PC1-LTE-01', 'PC1-TCMS-01', 'PC1-ETBN-01']);
    state.hl.roots = new Set(['PC1-LTE-01']); state.pathLabel = 'LTE-R 통신 경로 · 지상 기지국 → 지붕 안테나 → 차상장치 → TCMS → 열차 백본';
    if (!state.wireless) { state.wireless = true; $('#tWireless').classList.add('on'); }
    refresh(); focusSet(state.hl.nodes); pan2DToSet(state.hl.nodes);
  },
  4() { state.simFault.clear(); select('T3-DCU-01', { mode: 'upstream' }); },
  5() {
    pushHistory(); state.simFault.clear(); state.selected = null; state.mode = 'issues'; state.expanded = null; state.showRange = false; state.form = null;
    const nodes = new Set(ISSUES.flatMap((i) => i.devices)), edges = new Set(ISSUES.filter((i) => i.connection).map((i) => i.connection));
    if (!nodes.size) { state.mode = 'none'; state.hl = null; refresh(); toast('열린 장치 간 문제가 없습니다'); return; }
    state.hl = { nodes, edges, roots: new Set(nodes) };
    refresh(); focusSet(nodes); pan2DToSet(nodes);
  },
};
function initScenarios() {
  if (!APP.demoMode) { $('#scenbar').querySelectorAll('.scen, .lbl').forEach((x) => (x.style.display = 'none')); }
  document.querySelectorAll('.scen').forEach((b) => (b.onclick = () => {
    const s = +b.dataset.s;
    if (state.car !== 'ALL') { state.car = 'ALL'; $('#fCar').value = 'ALL'; }
    if (state.status !== 'ALL') { state.status = 'ALL'; $('#fStatus').value = 'ALL'; }
    state.cats = new Set(Object.keys(CATS)); document.querySelectorAll('#fCats .chip').forEach((c) => c.classList.add('on'));
    SCEN[s](); state.scenario = s; markScen();
  }));
}

export function initApp() {
  initControls();
  initLayout();
  initSearch();
  initScenarios();
  connectEvents();
  window.__app = { state, select, SCEN, resetAll, afterWrite };
}
