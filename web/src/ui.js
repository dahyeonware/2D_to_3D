// UI 기본 요소: DOM 헬퍼, 이스케이프, 툴팁, 토스트
import { EQ, CATS, STATUS_COLOR } from './data.js';
import { statusOf } from './state.js';
import { iconSVG } from './icons.js';

export const $ = (s) => document.querySelector(s);
export const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[m]);

const tip = $('#tip');
export function showTip(id, x, y) {
  const e = EQ.get(id);
  const st = statusOf(e);
  tip.innerHTML = `<code>${e.id}</code><div style="display:flex;align-items:center;gap:6px">${iconSVG(e.code, CATS[e.category].color, 20)}<b>${esc(e.name)}</b></div><div style="color:#7f92b8;font-size:11px">${e.car} · ${e.zone} · <span style="color:${STATUS_COLOR[st]}">${st}</span></div>`;
  tip.style.display = 'block';
  const w = tip.offsetWidth;
  tip.style.left = Math.min(innerWidth - w - 8, x + 14) + 'px';
  tip.style.top = y + 14 + 'px';
}
export function hideTip() {
  tip.style.display = 'none';
}

let toastTimer = null;
export function toast(msg, { error = false } = {}) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.toggle('err', error);
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), error ? 4200 : 2400);
}
