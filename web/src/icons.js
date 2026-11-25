// 장비 아이콘 (DB equipment_types.icon_svg 사용) · 경고 아이콘
import { ICON, CATS } from './data.js';

export const iconSVG = (code, color, px = 16, sw = 1.8) =>
  `<svg width="${px}" height="${px}" viewBox="-12.5 -12.5 25 25" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;vertical-align:middle">${ICON[code] || '<circle r="8"/>'}</svg>`;
export const iconOf = (e) => iconSVG(e.code, CATS[e.category].color);

// 이상 상태 표시: 고장 = 빨간 위험 삼각형(!), 주의 = 노란 원(!)
export function warnMark(st) {
  const bang = (y) =>
    `<path d="M0 ${y - 4.2}v4.4" stroke="#08162e" stroke-width="1.9" stroke-linecap="round"/><circle cx="0" cy="${y + 2.6}" r="1.05" fill="#08162e"/>`;
  return st === '고장'
    ? `<g class="st blink" data-st="고장" transform="translate(7,-8)"><path d="M0 -7.5L7.6 5.5H-7.6Z" fill="#ff5d5d" stroke="#08162e" stroke-width="1.1" stroke-linejoin="round"/>${bang(1)}</g>`
    : `<g class="st" data-st="주의" transform="translate(7,-8)"><circle r="6.4" fill="#f2c94c" stroke="#08162e" stroke-width="1.1"/>${bang(0)}</g>`;
}

export const warnIcon = (st) =>
  `<svg width="16" height="16" viewBox="-9 -9 18 18">${
    st === '고장'
      ? '<path d="M0 -7.5L7.6 5.5H-7.6Z" fill="#ff5d5d"/><path d="M0 -3v4" stroke="#08162e" stroke-width="1.9" stroke-linecap="round"/><circle cy="3.4" r="1" fill="#08162e"/>'
      : '<circle r="6.6" fill="#f2c94c"/><path d="M0 -4v4.4" stroke="#08162e" stroke-width="1.9" stroke-linecap="round"/><circle cy="2.6" r="1" fill="#08162e"/>'
  }</svg>`;

export const PAIR_ICON = (col) =>
  `<svg width="16" height="16" viewBox="-9 -9 18 18"><circle r="7.5" fill="${col}"/><path d="M-4 0h8M-1.5 -2.6l-2.5 2.6 2.5 2.6M1.5 -2.6l2.5 2.6-2.5 2.6" stroke="#08162e" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export function symbolPath(shape, r, color, op = 1, extra = '') {
  const f = `fill="${color}" fill-opacity="${op}" ${extra}`;
  switch (shape) {
    case 'rect': return `<rect x="${-r * 1.3}" y="${-r * 0.85}" width="${r * 2.6}" height="${r * 1.7}" rx="1" ${f}/>`;
    case 'square': return `<rect x="${-r * 0.95}" y="${-r * 0.95}" width="${r * 1.9}" height="${r * 1.9}" rx="${r * 0.45}" ${f}/>`;
    case 'tri': return `<path d="M0 ${-r * 1.15} L${r * 1.1} ${r * 0.85} L${-r * 1.1} ${r * 0.85}Z" ${f}/>`;
    case 'diamond': return `<path d="M0 ${-r * 1.15} L${r * 1.1} 0 L0 ${r * 1.15} L${-r * 1.1} 0Z" ${f}/>`;
    case 'hex': {
      let p = '';
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i;
        p += (i ? 'L' : 'M') + (Math.cos(a) * r * 1.1).toFixed(2) + ' ' + (Math.sin(a) * r * 1.1).toFixed(2);
      }
      return `<path d="${p}Z" ${f}/>`;
    }
    default: return `<circle r="${r}" ${f}/>`;
  }
}
