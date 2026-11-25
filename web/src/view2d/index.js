// 2D 도면 (평면도·측면도, 줌/팬, 미니맵, 실제 크기 외곽선, 장비 아이콘, 장치 간 문제 이슈선)
import { TRAINSET, EQUIPMENT, CONNECTIONS, ISSUES, CARS, EQ, CONN, CATS, PROTO, ICON, ISSUE_BY_CONN } from '../data.js';
import { state, statusOf, eqVisible, connVisible, ISSUE_COLOR, Coord, SX, SY } from '../state.js';
import { warnMark } from '../icons.js';
import { $, showTip, hideTip } from '../ui.js';
import { select, resetAll } from '../app.js';
import { focusCar } from '../view3d/index.js';

const NS = 'http://www.w3.org/2000/svg';
const vp = $('#vp'), drawing = $('#drawing');
export const t2 = { k: 1, x: 20, y: 0 }; // 화면 변환
let eq2D = new Map(), conn2D = new Map(), fp2D = new Map(), warn2D = new Map(), issue2D = [];
let iconScale = 1;
function applyWarnScale(w) {
  w.setAttribute('transform', `translate(${w.dataset.x},${w.dataset.y}) scale(${iconScale * 1.7})`);
}

export function build2D() {
  const v = state.view, sy = SY[v];
  let g = '';
  // 그리드
  const gy0 = v === 'plan' ? -5 * sy : -7 * sy, gy1 = v === 'plan' ? 4 * sy : 1.5 * sy;
  g += `<g stroke="#12305a" stroke-width="0.6">`;
  for (let x = -10; x <= TRAINSET.totalLength + 10; x += 5) g += `<line x1="${x * SX}" y1="${gy0}" x2="${x * SX}" y2="${gy1}" ${x % 25 === 0 ? 'stroke="#1a4378"' : ''}/>`;
  for (let y = Math.ceil((gy0 / sy) * 2) / 2; y * sy <= gy1; y += 0.5) g += `<line x1="${-10 * SX}" y1="${y * sy}" x2="${(TRAINSET.totalLength + 10) * SX}" y2="${y * sy}"/>`;
  g += `</g>`;
  // 차체 외곽
  g += `<g fill="none" stroke="#3fd6e0" stroke-width="1.3">`;
  for (const c of CARS) {
    const x0 = c.start * SX, x1 = (c.start + c.length) * SX, pc = c.type === 'PC', front = c.side === 'front';
    if (v === 'plan') {
      const yT = -1.45 * sy, yB = 1.45 * sy;
      if (pc) {
        const n = 7 * SX;
        const p = front
          ? `M${x0} 0 C${x0 + n * 0.15} ${yT * 0.85} ${x0 + n * 0.5} ${yT} ${x0 + n} ${yT} L${x1} ${yT} L${x1} ${yB} L${x0 + n} ${yB} C${x0 + n * 0.5} ${yB} ${x0 + n * 0.15} ${yB * 0.85} ${x0} 0Z`
          : `M${x1} 0 C${x1 - n * 0.15} ${yT * 0.85} ${x1 - n * 0.5} ${yT} ${x1 - n} ${yT} L${x0} ${yT} L${x0} ${yB} L${x1 - n} ${yB} C${x1 - n * 0.5} ${yB} ${x1 - n * 0.15} ${yB * 0.85} ${x1} 0Z`;
        g += `<path d="${p}"/>`;
        const cab = front ? x0 + 4.2 * SX : x1 - 4.2 * SX;
        g += `<line x1="${cab}" y1="${yT}" x2="${cab}" y2="${yB}" stroke-dasharray="4 3" stroke-width="0.8"/>`;
        const mr = front ? x0 + 13.5 * SX : x1 - 13.5 * SX;
        g += `<line x1="${mr}" y1="${yT}" x2="${mr}" y2="${yB}" stroke-dasharray="4 3" stroke-width="0.8"/>`;
      } else {
        g += `<rect x="${x0 + 3}" y="${yT}" width="${x1 - x0 - 6}" height="${yB - yT}" rx="4"/>`;
        // 좌석 열 표시
        g += `<g stroke="#1d5a6b" stroke-width="0.6">`;
        for (let s = c.start + 4; s < c.start + c.length - 3; s += 1.1) {
          g += `<line x1="${s * SX}" y1="${-1.25 * sy}" x2="${s * SX}" y2="${-0.35 * sy}"/><line x1="${s * SX}" y1="${0.35 * sy}" x2="${s * SX}" y2="${1.25 * sy}"/>`;
        }
        g += `</g>`;
        // 출입문
        const dx = c.type === 'MC' ? (front ? x0 + 2.4 * SX : x1 - 2.4 * SX) : x0 + 1.9 * SX;
        g += `<line x1="${dx - 12}" y1="${yT}" x2="${dx + 12}" y2="${yT}" stroke="#ffe066" stroke-width="2.5"/><line x1="${dx - 12}" y1="${yB}" x2="${dx + 12}" y2="${yB}" stroke="#ffe066" stroke-width="2.5"/>`;
      }
    } else {
      const yF = -1.0 * sy, yR = -4.0 * sy;
      if (pc) {
        const n = 8 * SX;
        const p = front
          ? `M${x0 + 4} ${yF} L${x1} ${yF} L${x1} ${yR} L${x0 + n} ${yR} C${x0 + n * 0.5} ${yR} ${x0 + n * 0.12} ${-2.6 * sy} ${x0} ${-1.5 * sy} L${x0 + 4} ${yF}Z`
          : `M${x1 - 4} ${yF} L${x0} ${yF} L${x0} ${yR} L${x1 - n} ${yR} C${x1 - n * 0.5} ${yR} ${x1 - n * 0.12} ${-2.6 * sy} ${x1} ${-1.5 * sy} L${x1 - 4} ${yF}Z`;
        g += `<path d="${p}"/>`;
      } else g += `<rect x="${x0 + 3}" y="${yR}" width="${x1 - x0 - 6}" height="${yR * -1 + yF}" rx="5"/>`;
      g += `<line x1="${x0 + 6}" y1="${-1.25 * sy}" x2="${x1 - 6}" y2="${-1.25 * sy}" stroke-dasharray="6 4" stroke-width="0.7"/>`;
      // 창문
      if (!pc) {
        g += `<g stroke-width="0.7">`;
        for (let s = c.start + 4; s < c.start + c.length - 3; s += 1.6) g += `<rect x="${s * SX}" y="${-2.9 * sy}" width="${0.9 * SX}" height="${0.65 * sy}" rx="2"/>`;
        g += `</g>`;
      }
    }
  }
  g += `</g>`;
  // 대차
  g += `<g stroke="#7fb4c4" fill="none" stroke-width="1">`;
  for (const b of TRAINSET.bogies) {
    const x = b.x * SX;
    if (v === 'plan') g += `<rect x="${x - 1.5 * SX}" y="${-1.2 * sy}" width="${3 * SX}" height="${2.4 * sy}" stroke-dasharray="3 2" rx="2"/><line x1="${x}" y1="${-1.4 * sy}" x2="${x}" y2="${1.4 * sy}" stroke-dasharray="1 2"/>`;
    else {
      g += `<rect x="${x - 1.5 * SX}" y="${-0.95 * sy}" width="${3 * SX}" height="${0.35 * sy}"/>`;
      for (const d of [-1.25, 1.25]) g += `<circle cx="${x + d * SX}" cy="${-0.46 * sy}" r="${0.46 * sy}"/>`;
    }
  }
  g += `</g>`;
  if (v === 'side') {
    g += `<line x1="${-10 * SX}" y1="0" x2="${(TRAINSET.totalLength + 10) * SX}" y2="0" stroke="#3fd6e0" stroke-width="1.4"/>`;
    g += `<line x1="${-10 * SX}" y1="${-5.4 * sy}" x2="${(TRAINSET.totalLength + 10) * SX}" y2="${-5.4 * sy}" stroke="#ff8a8a" stroke-width="0.9" stroke-dasharray="10 4"/>`;
    g += `<text x="${-8 * SX}" y="${-5.55 * sy}" fill="#ff8a8a" font-size="9" font-family="IBM Plex Mono">전차선 AC 25kV</text>`;
    g += `<text x="${-8 * SX}" y="-5" fill="#3fd6e0" font-size="9" font-family="IBM Plex Mono">레일면 (RL ±0)</text>`;
  } else {
    for (const z of [-0.7175, 0.7175]) g += `<line x1="${-10 * SX}" y1="${z * sy}" x2="${(TRAINSET.totalLength + 10) * SX}" y2="${z * sy}" stroke="#1d4d6b" stroke-width="0.8"/>`;
    g += `<text x="${-9 * SX}" y="${-3.05 * sy}" fill="#7f92b8" font-size="9" font-family="IBM Plex Mono">선로변 →</text>`;
  }
  // 치수선 + 차량 라벨
  const dy = v === 'plan' ? -4.3 * sy : -6.6 * sy;
  g += `<g stroke="#5fb3bf" stroke-width="0.7" fill="#9fe9ef" font-family="IBM Plex Mono" font-size="10">`;
  for (const c of CARS) {
    const x0 = c.start * SX, x1 = (c.start + c.length) * SX;
    g += `<line x1="${x0}" y1="${dy - 6}" x2="${x0}" y2="${dy + 8}"/><line x1="${x1}" y1="${dy - 6}" x2="${x1}" y2="${dy + 8}"/>`;
    g += `<line x1="${x0}" y1="${dy}" x2="${x1}" y2="${dy}" marker-start="url(#ar)" marker-end="url(#ar)"/>`;
    g += `<text x="${(x0 + x1) / 2}" y="${dy - 4}" text-anchor="middle" stroke="none">${Math.round(c.length * 1000).toLocaleString()}</text>`;
    g += `<text x="${(x0 + x1) / 2}" y="${dy + (v === 'plan' ? 24 : 22)}" text-anchor="middle" stroke="none" font-size="13" font-weight="600" fill="#e8fbff">${c.id}</text>`;
    g += `<text x="${(x0 + x1) / 2}" y="${dy + (v === 'plan' ? 37 : 35)}" text-anchor="middle" stroke="none" font-size="9.5" fill="#5fb3bf" font-family="Noto Sans KR">${c.name}</text>`;
  }
  g += `</g>`;

  // 연결선
  g += `<g id="g2fp"></g><g id="g2conn" fill="none"></g><g id="g2issue" fill="none" pointer-events="none"></g><g id="g2eq"></g><g id="g2warn" pointer-events="none"></g>`;
  const hatch = Object.entries(CATS)
    .map(([, c], i) => `<pattern id="hp${i}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="${c.color}" stroke-width="1" stroke-opacity=".35"/></pattern>`)
    .join('');
  vp.innerHTML = `<defs>${hatch}<marker id="ar" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 2 L5 5 L0 8" fill="none" stroke="#5fb3bf"/></marker></defs>` + g;

  const gc = vp.querySelector('#g2conn'), ge = vp.querySelector('#g2eq'), gf = vp.querySelector('#g2fp');
  conn2D = new Map(); eq2D = new Map(); fp2D = new Map(); warn2D = new Map();
  const catIdx = Object.fromEntries(Object.keys(CATS).map((k, i) => [k, i]));
  const HIDDEN_ZONES = ['차체 하부', '대차', '궤도'];
  for (const e of EQUIPMENT) { // 실제 크기 외곽선 (배치도 표현, 확대 시 표시)
    const { x, y } = Coord.to2D(e, v), col = CATS[e.category].color;
    const w = e.dims.l * SX, hgt = v === 'plan' ? e.dims.w * SY.plan : e.dims.h * SY.side;
    const yy = y - hgt / 2;
    const dashed = v === 'plan' && HIDDEN_ZONES.includes(e.zone);
    const r = document.createElementNS(NS, 'rect');
    r.setAttribute('x', x - w / 2); r.setAttribute('y', yy); r.setAttribute('width', w); r.setAttribute('height', hgt); r.setAttribute('rx', Math.min(3, w / 6));
    r.setAttribute('fill', `url(#hp${catIdx[e.category]})`); r.setAttribute('stroke', col); r.setAttribute('stroke-width', '1.1'); r.setAttribute('vector-effect', 'non-scaling-stroke');
    if (dashed) r.setAttribute('stroke-dasharray', '5 3');
    r.dataset.id = e.id; r.style.cursor = 'pointer'; gf.appendChild(r); fp2D.set(e.id, r);
  }
  for (const c of CONNECTIONS) {
    const a = Coord.to2D(EQ.get(c.from), v), b = Coord.to2D(EQ.get(c.to), v);
    const dx = b.x - a.x, dist = Math.hypot(dx, b.y - a.y), bulge = Math.min(90, 14 + dist * 0.12) * (c.layer === 'power' ? 1 : -1);
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 + (v === 'plan' ? bulge * 0.7 : bulge * (c.type === 'wireless' ? -1.4 : 0.6));
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', `M${a.x} ${a.y} Q${mx} ${my} ${b.x} ${b.y}`);
    p.setAttribute('stroke', PROTO[c.protocol].color);
    p.setAttribute('vector-effect', 'non-scaling-stroke');
    if (c.type === 'wireless') p.setAttribute('stroke-dasharray', '5 4');
    p.dataset.id = c.id; gc.appendChild(p); conn2D.set(c.id, p);
  }
  buildIssues2D();
  for (const e of EQUIPMENT) {
    const { x, y } = Coord.to2D(e, v); const cat = CATS[e.category];
    const g1 = document.createElementNS(NS, 'g'); g1.setAttribute('transform', `translate(${x},${y})`); g1.dataset.id = e.id; g1.dataset.x = x; g1.dataset.y = y; g1.style.cursor = 'pointer';
    g1.innerHTML = `<circle class="halo" r="13" fill="none" stroke="#ffe066" stroke-width="2" opacity="0"/>`
      + `<circle r="8.6" fill="#08162e" stroke="${cat.color}" stroke-width="1.1"/>`
      + `<g transform="scale(0.56)" fill="none" stroke="${cat.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON[e.code] || ''}</g>`
      + `<text class="lb" x="0" y="${v === 'plan' ? 17 : -12}" text-anchor="middle" font-size="7.5" font-family="IBM Plex Mono" fill="#cfeff4">${e.id.split('-').slice(1).join('-').replace(/-01$/, '')}</text>`;
    ge.appendChild(g1); eq2D.set(e.id, g1);
  }
  $('#tbView').textContent = v === 'plan' ? '평면도 (TOP)' : '측면도 (SIDE)';
  $('#tbScale').textContent = v === 'plan' ? '길이 1:70 · 폭 과장' : '길이 1:70 · 높이 1:17';
  buildMinimap();
  apply2D(); style2D();
}

/** 장치 간 문제: 직접 연결이 있으면 그 연결선을 강조, 없으면 전용 이슈선을 그림 (이슈 변경 시 다시 호출) */
export function buildIssues2D() {
  const gi = vp.querySelector('#g2issue');
  if (!gi) return;
  gi.innerHTML = '';
  // 이전에 이슈로 강조되던 연결선은 기본 모양으로 되돌림
  for (const [id, p] of conn2D) {
    if (ISSUE_BY_CONN.has(id)) continue;
    const c = CONN.get(id);
    p.setAttribute('stroke', PROTO[c.protocol].color);
    if (c.type === 'wireless') p.setAttribute('stroke-dasharray', '5 4'); else p.removeAttribute('stroke-dasharray');
    p.classList.remove('blink');
  }
  issue2D = [];
  const v = state.view;
  for (const is of ISSUES) {
    const col = ISSUE_COLOR[is.severity]; let path;
    if (is.connection) { path = conn2D.get(is.connection); }
    else {
      const a = Coord.to2D(EQ.get(is.devices[0]), v), b = Coord.to2D(EQ.get(is.devices[1]), v);
      const d = Math.hypot(b.x - a.x, b.y - a.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 - Math.max(40, d * 0.5);
      path = document.createElementNS(NS, 'path'); path.setAttribute('d', `M${a.x} ${a.y} Q${mx} ${my} ${b.x} ${b.y}`);
      path.setAttribute('stroke', col); path.setAttribute('stroke-width', '2.6'); path.setAttribute('stroke-dasharray', '7 4');
      path.setAttribute('vector-effect', 'non-scaling-stroke'); path.classList.add('blink'); gi.appendChild(path);
    }
    issue2D.push({ is, path, own: !is.connection });
  }
}

export function apply2D() {
  vp.setAttribute('transform', `translate(${t2.x},${t2.y}) scale(${t2.k})`);
  const lblOn = t2.k >= 0.75, s = Math.min(12, Math.max(5, 8.6 * t2.k)) / (8.6 * t2.k); // 아이콘 화면 반지름 5~12px 유지
  const fp = vp.querySelector('#g2fp'); if (fp) fp.style.display = t2.k >= 1.5 ? '' : 'none';
  vp.querySelectorAll('.lb').forEach((t) => (t.style.display = lblOn ? '' : 'none'));
  iconScale = s;
  for (const g of eq2D.values()) g.setAttribute('transform', `translate(${g.dataset.x},${g.dataset.y}) scale(${s})`);
  for (const w of warn2D.values()) applyWarnScale(w);
  updateMinimapWin();
}
export function center2DY() { const h = drawing.clientHeight; t2.y = state.view === 'plan' ? h * 0.52 : h * 0.5 + 2.6 * SY.side * t2.k; }
export function home2D() { const w = drawing.clientWidth; t2.k = Math.min(1.3, (w - 30) / (46 * SX)); t2.x = 14 + 2 * SX * t2.k; center2DY(); apply2D(); }
export function fit2D() { const w = drawing.clientWidth; t2.k = Math.max(0.12, (w - 40) / ((TRAINSET.totalLength + 8) * SX)); t2.x = 20 + 4 * SX * t2.k; center2DY(); apply2D(); }
let anim2D = null;
function animate2D(tk, tx, ty) {
  cancelAnimationFrame(anim2D); const s = { ...t2 }, t0 = performance.now();
  const step = (now) => {
    const p = Math.min(1, (now - t0) / 450), e = 1 - Math.pow(1 - p, 3);
    t2.k = s.k + (tk - s.k) * e; t2.x = s.x + (tx - s.x) * e; t2.y = s.y + (ty - s.y) * e; apply2D(); if (p < 1) anim2D = requestAnimationFrame(step);
  };
  anim2D = requestAnimationFrame(step);
}
export function pan2DTo(id) {
  const e = EQ.get(id); const p = Coord.to2D(e, state.view); const k = Math.max(t2.k, 1.25);
  animate2D(k, drawing.clientWidth / 2 - p.x * k, drawing.clientHeight / 2 - p.y * k);
}
export function pan2DToX(xm) {
  const k = Math.max(t2.k, 0.95); const h = drawing.clientHeight;
  const ty = state.view === 'plan' ? h * 0.52 : h * 0.5 + 2.6 * SY.side * k;
  animate2D(k, drawing.clientWidth / 2 - xm * SX * k, ty);
}
export function pan2DToSet(ids) {
  const pts = [...ids].map((id) => Coord.to2D(EQ.get(id), state.view));
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const w = drawing.clientWidth, h = drawing.clientHeight;
  const k = Math.min(2.2, Math.max(0.12, Math.min((w - 80) / Math.max(60, x1 - x0), (h - 120) / Math.max(60, y1 - y0))));
  animate2D(k, w / 2 - ((x0 + x1) / 2) * k, h / 2 - ((y0 + y1) / 2) * k);
}

// 줌/팬
drawing.addEventListener('wheel', (e) => {
  e.preventDefault(); const r = drawing.getBoundingClientRect();
  const mx = e.clientX - r.left, my = e.clientY - r.top, f = Math.exp(-e.deltaY * 0.0015), k = Math.min(6, Math.max(0.1, t2.k * f));
  t2.x = mx - (mx - t2.x) * (k / t2.k); t2.y = my - (my - t2.y) * (k / t2.k); t2.k = k; apply2D();
}, { passive: false });
let drag = null;
drawing.addEventListener('mousedown', (e) => e.preventDefault()); // 드래그 시 브라우저 글자 선택 차단
drawing.addEventListener('pointerdown', (e) => { window.getSelection()?.removeAllRanges(); drag = { x: e.clientX, y: e.clientY, tx: t2.x, ty: t2.y, moved: false }; drawing.setPointerCapture(e.pointerId); });
drawing.addEventListener('pointermove', (e) => {
  if (drag) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 3) { drag.moved = true; drawing.classList.add('drag'); }
    if (drag.moved) { t2.x = drag.tx + dx; t2.y = drag.ty + dy; apply2D(); hideTip(); return; }
  }
  const g = e.target.closest && (e.target.closest('#g2eq > g') || e.target.closest('#g2fp rect')); if (g) showTip(g.dataset.id, e.clientX, e.clientY); else hideTip();
});
drawing.addEventListener('pointerup', (e) => {
  drawing.classList.remove('drag');
  if (drag && !drag.moved) {
    const el = document.elementFromPoint(e.clientX, e.clientY); const g = el && (el.closest('#g2eq > g') || el.closest('#g2fp rect'));
    if (g) { if (g.dataset.id === state.selected) resetAll(); else select(g.dataset.id, { from: '2d' }); }
  }
  drag = null;
});
drawing.addEventListener('pointerleave', hideTip);
$('#zIn').onclick = () => zoomBy(1.4); $('#zOut').onclick = () => zoomBy(1 / 1.4); $('#zFit').onclick = () => { fit2D(); };
function zoomBy(f) {
  const w = drawing.clientWidth / 2, h = drawing.clientHeight / 2, k = Math.min(6, Math.max(0.1, t2.k * f));
  animate2D(k, w - (w - t2.x) * (k / t2.k), h - (h - t2.y) * (k / t2.k));
}
$('#viewTabs').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b || b.dataset.v === state.view) return;
  state.view = b.dataset.v; document.querySelectorAll('#viewTabs button').forEach((x) => x.classList.toggle('on', x === b));
  const cx = (drawing.clientWidth / 2 - t2.x) / t2.k; build2D(); center2DY(); t2.x = drawing.clientWidth / 2 - cx * t2.k; apply2D();
});

// 미니맵
const mm = $('#minimap');
mm.addEventListener('mousedown', (e) => e.preventDefault());
function buildMinimap() {
  const L = TRAINSET.totalLength; mm.setAttribute('viewBox', `0 -0.6 ${L} 10.6`);
  let h = '';
  for (const c of CARS) {
    h += `<rect x="${c.start + 0.3}" y="1.5" width="${c.length - 0.6}" height="7" rx="${c.type === 'PC' ? 3 : 0.8}" fill="#0f2a4a" stroke="#3fd6e0" stroke-width="0.25" data-car="${c.id}"/>`;
    h += `<text x="${c.start + c.length / 2}" y="6.6" text-anchor="middle" font-size="4.2" fill="#9fe9ef" font-family="IBM Plex Mono" pointer-events="none">${c.id}</text>`;
  }
  h += `<g id="mmDots"></g><g id="mmWarn"></g><rect id="mmWin" y="0.4" height="9.2" fill="#3fd6e01a" stroke="#ffe066" stroke-width="0.35"/>`;
  mm.innerHTML = h;
}
function updateMinimapWin() {
  const w = $('#mmWin'); if (!w) return; const L = TRAINSET.totalLength;
  const x0 = (-t2.x / t2.k) / SX, x1 = ((drawing.clientWidth - t2.x) / t2.k) / SX;
  w.setAttribute('x', Math.max(0, x0)); w.setAttribute('width', Math.max(1, Math.min(L, x1) - Math.max(0, x0)));
}
mm.addEventListener('click', (e) => {
  const r = mm.getBoundingClientRect(); const xm = ((e.clientX - r.left) / r.width) * TRAINSET.totalLength;
  const car = CARS.find((c) => xm >= c.start && xm < c.start + c.length); if (car) { pan2DToX(car.start + car.length / 2); focusCar(car.id); }
});

export function style2D() {
  const hl = state.hl;
  for (const [id, g] of eq2D) {
    const e = EQ.get(id), vis = eqVisible(e);
    g.style.display = vis ? '' : 'none';
    const inHL = !hl || hl.nodes.has(id);
    g.style.opacity = inHL ? 1 : 0.18;
    const halo = g.querySelector('.halo');
    const isRoot = hl && hl.roots.has(id);
    halo.setAttribute('opacity', isRoot ? 1 : hl && state.mode === 'impact' && hl.nodes.has(id) ? 0.9 : 0);
    halo.setAttribute('stroke', state.mode === 'impact' && !isRoot ? '#ff5d5d' : '#ffe066');
    const st = statusOf(e);
    const fpr = fp2D.get(id); if (fpr) { fpr.style.display = vis ? '' : 'none'; fpr.style.opacity = inHL ? 1 : 0.15; }
    let w = warn2D.get(id);
    if (w && w.dataset.st !== st) { w.remove(); warn2D.delete(id); w = null; }
    if (st !== '정상' && !w) {
      const gw = vp.querySelector('#g2warn'); gw.insertAdjacentHTML('beforeend', `<g class="wm" data-id="${id}" data-st="${st}" data-x="${g.dataset.x}" data-y="${g.dataset.y}">${warnMark(st)}</g>`);
      w = gw.lastElementChild; warn2D.set(id, w); applyWarnScale(w);
    }
    if (w) w.style.display = vis ? '' : 'none';
  }
  for (const [id, p] of conn2D) {
    const c = CONN.get(id), vis = connVisible(c);
    p.style.display = vis ? '' : 'none';
    const on = hl ? hl.edges.has(id) : false;
    const is = ISSUE_BY_CONN.get(id);
    if (is) { // 장치 간 문제가 있는 연결: 문제 색 굵은 점선 + 깜빡임
      p.setAttribute('stroke', ISSUE_COLOR[is.severity]); p.setAttribute('stroke-width', 3); p.setAttribute('stroke-dasharray', '7 4'); p.classList.add('blink');
      p.setAttribute('stroke-opacity', !hl || on || is.devices.some((d) => hl.nodes.has(d)) ? 1 : 0.15);
      continue;
    }
    p.setAttribute('stroke-width', on ? 2.4 : 1);
    p.setAttribute('stroke-opacity', hl ? (on ? 1 : 0.05) : 0.32);
  }
  for (const it of issue2D) {
    const vis = it.is.devices.every((d) => eqVisible(EQ.get(d)));
    const op = !hl || it.is.devices.some((d) => hl.nodes.has(d)) ? 1 : 0.15;
    if (it.own) { it.path.style.display = vis ? '' : 'none'; it.path.style.opacity = op; }
  }
  // 미니맵 점
  const mw = $('#mmWarn');
  if (mw) {
    mw.innerHTML = EQUIPMENT.filter((e) => e.car !== '지상' && statusOf(e) !== '정상').map((e) => {
      const x = e.pos3d.x, bad = statusOf(e) === '고장';
      return bad ? `<path class="blink" d="M${x} 0.2L${x + 1.5} 2.9H${x - 1.5}Z" fill="#ff5d5d"/>` : `<circle cx="${x}" cy="1.6" r="1.25" fill="#f2c94c"/>`;
    }).join('');
  }
  const d = $('#mmDots');
  if (d) {
    d.innerHTML = hl ? [...hl.nodes].map((id) => { const e = EQ.get(id); return `<circle cx="${e.pos3d.x}" cy="5" r="0.9" fill="${hl.roots.has(id) ? '#ffe066' : state.mode === 'impact' ? '#ff5d5d' : '#3fd6e0'}"/>`; }).join('') : '';
  }
}

export function init2D() {
  $('#tbNo').textContent = TRAINSET.drawingNo;
  build2D();
  home2D();
  new ResizeObserver(() => { apply2D(); }).observe(drawing);
}
