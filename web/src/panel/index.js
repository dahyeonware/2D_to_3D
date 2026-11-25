// 우측 정보 패널: 정보·연결 / 정비 내역(최신순) / 정비 매뉴얼 탭, 원인 박스, 장치 간 문제, 매뉴얼 상세 창
import {
  TRAINSET, EQUIPMENT, CONNECTIONS, ISSUES, CARS, CARMAP, EQ, ADJ, CATS, PROTO, STATUS_COLOR, APP,
  ISSUE_BY_CONN, MAINTENANCE, MANUALS, detailLoaded, ensureDetail,
} from '../data.js';
import { state, statusOf, ownStatusOf, issuesOf, ISSUE_COLOR, impact, upChain } from '../state.js';
import { iconSVG, iconOf, warnIcon, PAIR_ICON } from '../icons.js';
import { $, esc, toast } from '../ui.js';
import { select, setMode, goBack, goForward, refresh, recomputeHL } from '../app.js';
import { focusCar, focusSet } from '../view3d/index.js';
import { pan2DToX } from '../view2d/index.js';
import { maintFormHTML, statusFormHTML, statusHistHTML, issueCtlHTML, bindForms } from './forms.js';

const MTYPE = { 정기점검: '#4fc3f7', 부품교체: '#c77dff', 고장수리: '#ff8a50', 개량: '#5be08a' };

export function renderPanel() {
  const P = $('#panel'); const keepScroll = P.scrollTop; requestAnimationFrame(() => { P.scrollTop = keepScroll; });
  // 다시 그려도(SSE 갱신·지연 로딩 도착 등) 입력 중인 폼 값과 포커스는 유지
  const prev = P.querySelector('form.form');
  const saved = prev ? { id: prev.id, vals: [...prev.elements].filter((x) => x.name).map((x) => [x.name, x.value]), focus: document.activeElement?.name } : null;
  if (!state.selected) renderOverview(P); else renderEquipment(P);
  if (saved) {
    const f = P.querySelector(`#${saved.id}`);
    if (f) {
      for (const [k, v] of saved.vals) if (f.elements[k]) f.elements[k].value = v;
      if (saved.focus && f.elements[saved.focus]) f.elements[saved.focus].focus();
    }
  }
}

function renderEquipment(P) {

  const e = EQ.get(state.selected), st = statusOf(e), cat = CATS[e.category];
  // 정비 내역·매뉴얼은 장비 선택 시 지연 로딩 → 도착하면 다시 그림
  if (!detailLoaded(e)) {
    ensureDetail(e).then(() => { if (state.selected === e.id) renderPanel(); }, (err) => toast(`상세 정보 로딩 실패: ${err.message}`, { error: true }));
  }
  const links = ADJ.get(e.id);
  const wired = links.filter((l) => l.c.type === 'wired'), wl = links.filter((l) => l.c.type === 'wireless');
  const topSet = new Set(links.map((l) => l.other));
  const imp = impact(e.id); const impCars = [...new Set([...imp.nodes].filter((i) => i !== e.id).map((i) => EQ.get(i).car))];
  const impList = [...imp.nodes].filter((i) => i !== e.id);
  const man = MANUALS[e.code];
  const wifi = e.code === 'WIFI' ? `<div class="conn" style="cursor:default"><span class="dir">((·))</span><div class="nm">객실 승객 단말 (가상)</div><span class="proto" style="background:#ff6ec722;color:#ff6ec7">Wi-Fi</span><div class="meta">2.4/5 GHz · 최대 동시 접속 120대 · 커버리지 링 표시</div></div>` : '';
  const back = state.history.length || state.forward.length ? (() => {
    const hb = state.history[state.history.length - 1], hf = state.forward[state.forward.length - 1];
    const x = hb && hb.id ? EQ.get(hb.id) : null;
    const arrow = (d) => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
    const nm = (h) => (h && h.id ? EQ.get(h.id).name : '장치 간 문제 보기');
    return `<div class="navbar">
        <button class="navb" id="btnBack" ${hb ? '' : 'disabled'} title="${hb ? '돌아가기: ' + esc(nm(hb)) : '이전 장비 없음'}">${arrow('M15 5l-7 7 7 7')}</button>
        <div class="navl" ${hb ? 'id="navLabel" title="이전에 보던 장치로 돌아가기"' : ''}>${x ? `${iconOf(x)}<span>${esc(x.name)}</span>` : hb ? `<span>${esc(nm(hb))}</span>` : '<span class="dimt">이전 장치 없음</span>'}</div>
        <button class="navb" id="btnFwd" ${hf ? '' : 'disabled'} title="${hf ? '앞으로 가기: ' + esc(nm(hf)) : '다음 장비 없음'}">${arrow('M9 5l7 7-7 7')}</button>
      </div>`;
  })() : '';
  const nMaint = MAINTENANCE[e.id] ? MAINTENANCE[e.id].length : '…';
  P.innerHTML = `${back}
    <div class="eqhead"><div class="tile" style="border-color:${cat.color}">${iconSVG(e.code, cat.color, 34, 1.6)}</div><div style="min-width:0;flex:1">
    <div class="idline">${e.id}</div>
    <h2>${esc(e.name)}</h2>
    <div style="display:flex;gap:10px;align-items:center;margin-top:4px">
      <span class="badge ${st}">${st}${state.simFault.has(e.id) ? ' (시뮬레이션)' : ''}</span>
      <span class="catchip"><i style="background:${cat.color}"></i>${e.category}</span>
      <button class="btn sm" id="btnStatus" style="margin-left:auto" title="장비 자체 상태 변경 (사유 입력, 이력 저장)">상태 변경</button>
    </div></div></div>
    ${state.form === 'status' ? statusFormHTML(e) : ''}
    ${causeHTML(e)}
    <div class="ptabs">
      <button data-tab="info" class="${state.tab === 'info' ? 'on' : ''}">정보·연결</button>
      <button data-tab="maint" class="${state.tab === 'maint' ? 'on' : ''}">정비 내역 <span class="n">${nMaint}</span></button>
      <button data-tab="manual" class="${state.tab === 'manual' ? 'on' : ''}">정비 매뉴얼</button>
    </div>
    ${state.tab === 'maint' ? maintHTML(e) : state.tab === 'manual' ? manualHTML(e) : `
    <div class="actions">
      <button class="btn ${state.mode === 'neighbors' ? 'on' : ''}" data-m="neighbors">연결 탐색</button>
      <button class="btn ${state.mode === 'impact' ? 'on' : ''}" data-m="impact">장애 영향 분석</button>
      <button class="btn ${state.mode === 'upstream' ? 'on' : ''}" data-m="upstream">상위 경로 추적</button>
    </div>
    <div class="sect"><h3>장비 정보</h3><dl class="kv">
      <dt>차량 / 구역</dt><dd>${e.car} · ${e.zone}</dd>
      <dt>2D 좌표</dt><dd class="mono">x ${e.pos2d.x.toFixed(2)} m, y ${e.pos2d.y.toFixed(2)} m</dd>
      <dt>3D 좌표</dt><dd class="mono">(${e.pos3d.x.toFixed(2)}, ${e.pos3d.y.toFixed(2)}, ${e.pos3d.z.toFixed(2)})</dd>
      <dt>제조사</dt><dd>${esc(e.manufacturer)}</dd>
      <dt>모델</dt><dd class="mono">${esc(e.model)}</dd>
      <dt>설치일</dt><dd class="mono">${e.installDate ?? '-'}</dd>
      <dt>최근 점검</dt><dd class="mono">${e.lastInspection ?? '-'}</dd>
      <dt>설명</dt><dd>${esc(e.description)}</dd>
    </dl></div>
    ${state.mode === 'upstream' ? upstreamHTML(e.id) : ''}
    <div class="sect"><h3>유선 연결 <span class="n">${wired.length}</span><span class="dirnote">↑ 상위 · ↓ 하위 · ⇄ 양방향</span></h3>${wired.map((l) => connRowX(l, topSet)).join('') || '<div class="empty">없음</div>'}</div>
    <div class="sect"><h3>무선 연결 <span class="n">${wl.length + (wifi ? 1 : 0)}</span></h3>${wl.map((l) => connRowX(l, topSet)).join('')}${wifi}${wl.length || wifi ? '' : '<div class="empty">없음</div>'}</div>
    <div class="sect"><h3>장애 영향 분석</h3><div class="impact">
      ${impList.length ? `<div style="font-size:12px">이 장비가 고장 나면 <b style="color:#ffb3b3">${impList.length}개 장비</b>가 영향을 받습니다.</div>
      <div class="cars">${impCars.map((c) => `<span>${c}</span>`).join('')}</div>
      <ul>${impList.map((i) => { const x = EQ.get(i); return `<li data-id="${i}">${iconSVG(x.code, CATS[x.category].color, 14)}<code>${i}</code>${esc(x.name)}</li>`; }).join('')}</ul>`
      : `<div style="font-size:12px;color:var(--muted)">하위 의존 장비 없음 (말단 장비). 이중화 백본 링크는 분석에서 제외됩니다.</div>`}
      ${impList.length && APP.demoMode ? `<div class="actions" style="margin-top:8px"><button class="btn" id="simFault">${state.simFault.has(e.id) ? '고장 시뮬레이션 해제' : '고장 시뮬레이션'}</button>${state.simFault.has(e.id) && man ? `<button class="btn" data-openman="${man.faults[0]?.code || ''}">조치 절차 보기 →</button>` : ''}</div>` : ''}
    </div></div>
    <div class="sect"><h3>상태 변경 이력</h3>${statusHistHTML(e)}</div>`}`;
  P.querySelector('#btnBack')?.addEventListener('click', goBack);
  P.querySelector('#navLabel')?.addEventListener('click', goBack);
  P.querySelector('#btnFwd')?.addEventListener('click', goForward);
  P.querySelector('#btnStatus').onclick = () => { state.form = state.form === 'status' ? null : 'status'; renderPanel(); };
  P.querySelectorAll('.ptabs button').forEach((b) => (b.onclick = () => { state.tab = b.dataset.tab; state.form = state.form === 'status' ? 'status' : null; renderPanel(); }));
  P.querySelectorAll('[data-openman]').forEach((b) => (b.onclick = (ev) => { ev.preventDefault(); openManual(e, b.dataset.openman); }));
  P.querySelectorAll('.actions [data-m]').forEach((b) => (b.onclick = () => setMode(b.dataset.m)));
  P.querySelectorAll('.impact li').forEach((li) => (li.onclick = () => select(li.dataset.id, { from: 'panel' })));
  const sf = P.querySelector('#simFault');
  if (sf) sf.onclick = () => {
    state.tab = 'info';
    if (state.simFault.has(e.id)) state.simFault.delete(e.id);
    else { state.simFault.add(e.id); state.mode = 'impact'; recomputeHL(); focusSet(state.hl.nodes); }
    refresh();
  };
  bindRows(P);
  bindForms(P, e);
}

function renderOverview(P) {
  const cnt = (s) => EQUIPMENT.filter((e) => statusOf(e) === s).length;
  const wired = CONNECTIONS.filter((c) => c.type === 'wired').length;
  P.innerHTML = `
    <h2>${esc(TRAINSET.name)}</h2>
    <div class="idline">${TRAINSET.drawingNo} · 전장 ${TRAINSET.totalLength.toFixed(1)} m</div>
    <div class="sect"><div class="stats">
      <div class="stat"><b>${CARS.length}</b><span>차량(량)</span></div>
      <div class="stat"><b>${EQUIPMENT.length}</b><span>장비</span></div>
      <div class="stat"><b>${CONNECTIONS.length}</b><span>연결</span></div>
      <div class="stat"><b>${wired}</b><span>유선</span></div>
      <div class="stat"><b>${CONNECTIONS.length - wired}</b><span>무선</span></div>
      <div class="stat"><b style="color:var(--warn)">${cnt('주의')}</b><span>주의 / <b style="display:inline;font-size:12px;color:var(--bad)">${cnt('고장')}</b> 고장</span></div>
    </div></div>
    <div class="sect"><h3>편성 (차량 클릭 시 이동)</h3><div class="carlist">${CARS.map((c) => `<button data-car="${c.id}">${c.id}<small>${c.name.replace('객차', '').replace(/[()]/g, '') || '객차'}</small></button>`).join('')}</div></div>
    <div class="sect"><h3>장치 간 문제 <span class="n">${ISSUES.length}</span></h3>${ISSUES.map((is) => {
      const a = EQ.get(is.devices[0]), b = EQ.get(is.devices[1]);
      return `<div class="cause pair" style="margin-top:0;margin-bottom:6px"><div class="ch">${PAIR_ICON(ISSUE_COLOR[is.severity])}<b>${esc(is.title)}</b><span class="code">${is.id}</span></div>
        <div class="partner">${iconOf(a)}<span>${esc(a.name)}</span><button class="go" data-go="${a.id}" title="이동">→</button><em>${is.connection ? '⇄' : '⋯'}</em>${iconOf(b)}<span>${esc(b.name)}</span><button class="go" data-go="${b.id}" title="이동">→</button></div>
        <div class="cf">${esc(is.type)} · ${is.connection ? '직접 연결된 장치 (연결선 표시)' : '직접 연결 없음 (이슈선 표시)'} · ${esc(is.status)}</div>
        ${issueCtlHTML(is)}</div>`;
    }).join('') || '<div class="empty">열린 장치 간 문제 없음</div>'}</div>
    <div class="sect"><h3>점검 필요 장비</h3>${EQUIPMENT.filter((e) => statusOf(e) !== '정상').map((e) => connRow({ other: e.id, c: null })).join('') || '<div class="empty">없음</div>'}</div>
    <div class="sect"><h3>사용 방법</h3><div class="note">
      · <b>2D 도면</b>이나 <b>3D 뷰</b>에서 장비를 클릭하면 양쪽이 함께 선택되고 카메라가 이동합니다.<br>
      · 선택 후 <b>연결 깊이</b>로 1~3단계 연결망을 펼쳐 볼 수 있습니다.<br>
      · 패널의 <b>장애 영향 분석</b> / <b>상위 경로 추적</b>으로 고장 전파와 공급 경로를 확인합니다.<br>
      · <b>정비 내역</b> 탭에서 내역을 추가하고, <b>상태 변경</b>으로 장비 상태를 기록할 수 있습니다 (DB 저장).<br>
      · 상단 <b>데모 시나리오</b> 1~5로 주요 기능을 바로 시연할 수 있습니다.<br>
      · <b>Esc</b> 또는 초기화로 선택을 해제합니다.</div></div>`;
  P.querySelectorAll('.carlist button').forEach((b) => (b.onclick = () => { focusCar(b.dataset.car); pan2DToX(CARMAP[b.dataset.car].start + CARMAP[b.dataset.car].length / 2); }));
  bindRows(P);
  bindForms(P, null);
}

function upstreamHTML(id) {
  const blk = (title, layer) => {
    const ch = upChain(id, layer); if (!ch.length) return '';
    return `<div style="margin-top:8px"><div style="font-size:11.5px;color:var(--muted);margin-bottom:4px">${title}</div>`
      + ch.map((n, i) => {
        const x = EQ.get(n.id), col = PROTO[n.c.protocol].color;
        return `<div class="conn" data-id="${n.id}"><span class="dir">${i + 1}</span><div class="nm">${iconOf(x)}<code>${n.id}</code>${esc(x.name)}</div><span class="proto" style="background:${col}22;color:${col}">${esc(n.c.protocolName)}</span><div class="meta">${x.car} · ${x.zone} · ↓ ${esc(n.c.description)}</div></div>`;
      }).join('')
      + `<div class="conn" style="cursor:default;border-color:var(--sel)"><span class="dir" style="color:var(--sel)">●</span><div class="nm">${iconOf(EQ.get(id))}<code>${id}</code>${esc(EQ.get(id).name)}</div><span></span><div class="meta">선택 장비</div></div></div>`;
  };
  return `<div class="sect"><h3>상위 경로 추적 (최상위 → 선택 장비)</h3>${blk('제어·통신 경로', 'data')}${blk('전원 공급 경로', 'power')}</div>`;
}

// 장치 간 문제 박스 (상대 장치 이동)
function pairHTML(e) {
  return issuesOf(e.id).map((is) => {
    const other = EQ.get(is.devices.find((d) => d !== e.id)), col = ISSUE_COLOR[is.severity];
    return `<div class="cause pair"><div class="ch">${PAIR_ICON(col)}<b>장치 간 문제</b><span class="tag2">${esc(is.type)}</span><span class="code">${is.id}</span></div>
      <div class="ptitle">${esc(is.title)}</div>
      <div class="partner">${iconOf(EQ.get(e.id))}<span>${esc(EQ.get(e.id).name)}</span><em>${is.connection ? '⇄ 직접 연결' : '⋯ 직접 연결 없음'}</em>${iconOf(other)}<span>${esc(other.name)}</span><button class="go" data-go="${other.id}" title="상대 장치로 이동">→</button></div>
      <div class="cb">${esc(is.cause)}</div>
      <div class="ev"><b>진단 근거</b> ${esc(is.evidence)}</div>
      <div class="cf">${is.since} 확인 · ${esc(is.status)} · 조치: ${esc(is.action)}</div>
      ${issueCtlHTML(is)}</div>`;
  }).join('');
}
function causeHTML(e) { return ownCauseHTML(e) + pairHTML(e); }
// 고장·주의 원인 요약 (장비 자체 상태 기준: 최근 고장 이력 + 매뉴얼 고장 코드)
function ownCauseHTML(e) {
  const st = state.simFault.has(e.id) ? '고장' : ownStatusOf(e); if (st === '정상') return '';
  const man = MANUALS[e.code];
  if (!detailLoaded(e)) return `<div class="cause ${st === '고장' ? 'bad' : 'warn'}"><div class="ch">${warnIcon(st)}<b>${st} 원인</b></div><div class="loading">불러오는 중…</div></div>`;
  if (!man || !man.faults.length) return `<div class="cause ${st === '고장' ? 'bad' : 'warn'}"><div class="ch">${warnIcon(st)}<b>${st} 원인</b></div><div class="cb">매뉴얼에 등록된 고장 코드가 없습니다.</div></div>`;
  if (state.simFault.has(e.id)) {
    const f = man.faults[0], n = impact(e.id).nodes.size - 1;
    return `<div class="cause bad"><div class="ch">${warnIcon('고장')}<b>고장 원인</b><span class="tag">시뮬레이션</span></div>
      <div class="cb">[${f.code}] ${esc(f.symptom)} 발생을 가정한 시연용 고장입니다. 하위 장비 ${n}개가 영향을 받습니다.</div>
      <div class="cf"><a href="#" data-openman="${f.code}">${f.code} 조치 절차 →</a></div></div>`;
  }
  const rec = (MAINTENANCE[e.id] || []).find((r) => r.faultCode);
  const f = (rec && man.faults.find((x) => x.code === rec.faultCode)) || man.faults[0];
  const detail = rec ? rec.summary.replace(/^\[[^\]]+\]\s*/, '') : f.symptom;
  return `<div class="cause ${st === '고장' ? 'bad' : 'warn'}"><div class="ch">${warnIcon(st)}<b>${st} 원인</b><span class="code">${f.code}</span></div>
    <div class="cb">${esc(detail)}</div>
    <div class="cf">${rec ? `${rec.date} · ${esc(rec.team)} · ${esc(rec.result)} · ` : ''}<a href="#" data-openman="${f.code}">조치 절차 →</a></div></div>`;
}

function maintHTML(e) {
  const recs = MAINTENANCE[e.id];
  const add = `<div class="sthead" style="margin-top:12px"><span class="note">최근 점검일 <b class="mono">${e.lastInspection ?? '-'}</b></span>
    <button class="btn sm ${state.form === 'maint' ? 'on' : ''}" id="btnAddMaint">${state.form === 'maint' ? '입력 취소' : '+ 내역 추가'}</button></div>
    ${state.form === 'maint' ? maintFormHTML(e) : ''}`;
  if (!recs) return add + '<div class="loading">정비 내역 불러오는 중…</div>';
  return add + `<div class="sect"><h3>정비 내역 · 최신순 <span class="n">${recs.length}</span></h3><div class="tl">`
    + recs.map((r, i) => `<div class="tli${i === 0 ? ' first' : ''}">
        <div class="tld" style="background:${MTYPE[r.type] || '#7f92b8'}"></div>
        <div class="tlh"><span class="mono">${r.date}</span><span class="mt" style="color:${MTYPE[r.type]};border-color:${MTYPE[r.type]}55">${r.type}</span>
          <span class="res ${r.result === '정상' ? 'ok' : 'pending'}">${esc(r.result)}</span></div>
        <div class="tls">${esc(r.summary)}</div>
        <div class="tlm">${esc(r.team || '-')}${r.hours != null ? ` · ${r.hours}h` : ''}${r.parts && r.parts !== '-' ? ' · 교체: ' + esc(r.parts) : ''} · <span class="mono">${r.id}</span>
          ${r.faultCode ? ` · <a href="#" data-openman="${r.faultCode}">${r.faultCode} 조치 절차</a>` : ''}</div>
      </div>`).join('') + `</div></div>
    <div class="note" style="margin-top:8px">가상 데이터 · 저장 위치: 로컬 SQLite (data/ktx.db)</div>`;
}

function manualHTML(e) {
  if (!(e.code in MANUALS)) return '<div class="loading">매뉴얼 불러오는 중…</div>';
  const m = MANUALS[e.code]; if (!m) return '<div class="empty">매뉴얼 없음</div>';
  const st = statusOf(e), rec = (MAINTENANCE[e.id] || [])[0];
  const activeFault = st !== '정상' ? (rec && rec.faultCode) || m.faults[0]?.code : null;
  return `<div class="sect"><div class="mancard">
      <div class="mono" style="color:var(--cad);font-size:11px">${esc(m.docNo)} · ${esc(m.rev)}</div>
      <div style="font-weight:700;margin:2px 0 6px">${esc(m.title)}</div>
      ${m.isVirtual ? '<div class="virt">가상 매뉴얼 · 실제 작업에 사용 금지</div>' : ''}
      <h4>점검 주기</h4><div class="chips">${m.interval.map((x) => `<span class="ichip">${esc(x)}</span>`).join('')}</div>
      <h4>작업 전 안전 조치</h4><ul class="safe">${m.safety.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
      ${activeFault ? `<div class="afault">현재 ${st} 상태 · 관련 고장 코드 <b>${activeFault}</b></div>` : ''}
      <div class="actions"><button class="btn" data-openman="${activeFault || ''}">매뉴얼 전체 보기 →</button></div>
    </div></div>`;
}

export async function openManual(e, fault) {
  if (!(e.code in MANUALS)) await ensureDetail(e).catch(() => {});
  const m = MANUALS[e.code]; if (!m) { toast('이 장비 종류의 매뉴얼이 없습니다', { error: true }); return; }
  $('#manBody').innerHTML = `
    <div class="mhead"><div class="tile" style="border-color:${CATS[e.category].color}">${iconSVG(e.code, CATS[e.category].color, 30, 1.6)}</div>
      <div><div class="mono" style="color:var(--cad);font-size:11.5px">${esc(m.docNo)} · ${esc(m.rev)} · 적용: ${e.id}</div><h2 style="margin:2px 0">${esc(m.title)}</h2>
      ${m.isVirtual ? '<div class="virt">가상 매뉴얼 · 해커톤 시연용으로 만든 예시이며 실제 작업에 사용할 수 없습니다</div>' : ''}</div></div>
    <div class="mgrid">
      <section><h4>1. 점검 주기</h4><div class="chips">${m.interval.map((x) => `<span class="ichip">${esc(x)}</span>`).join('')}</div>
        <h4>2. 작업 전 안전 조치</h4><ul class="safe">${m.safety.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
        <h4>3. 필요 공구</h4><div class="chips">${m.tools.map((x) => `<span class="ichip">${esc(x)}</span>`).join('')}</div></section>
      <section><h4>4. 점검 절차 <span style="color:var(--muted);font-weight:400">(체크하며 진행)</span></h4>
        <ol class="steps">${m.steps.map((x) => `<li><label><input type="checkbox"> <span>${esc(x)}</span></label></li>`).join('')}</ol>
        <div class="prog" id="manProg">0 / ${m.steps.length} 완료</div></section>
    </div>
    <h4>5. 고장 코드별 조치</h4>
    <table class="ftab"><thead><tr><th>코드</th><th>증상</th><th>조치</th></tr></thead><tbody>
      ${m.faults.map((f) => `<tr class="${f.code === fault ? 'hit' : ''}" id="f-${f.code}"><td class="mono">${f.code}</td><td>${esc(f.symptom)}</td><td>${esc(f.action)}</td></tr>`).join('')}
    </tbody></table>`;
  $('#manual').classList.add('open');
  const boxes = [...$('#manBody').querySelectorAll('.steps input')];
  boxes.forEach((b) => (b.onchange = () => { $('#manProg').textContent = `${boxes.filter((x) => x.checked).length} / ${boxes.length} 완료`; }));
  if (fault) { const r = document.getElementById('f-' + fault); if (r) setTimeout(() => r.scrollIntoView({ block: 'center', behavior: 'smooth' }), 60); }
}

function connRow(l) {
  const o = EQ.get(l.other); const c = l.c;
  if (!c) { const st = statusOf(o); return `<div class="conn" data-id="${o.id}"><span class="dir" style="color:${STATUS_COLOR[st]}">●</span><div class="nm">${iconOf(o)}<code>${o.id}</code>${esc(o.name)}</div><span class="proto" style="color:${STATUS_COLOR[st]}">${st}</span><div class="meta">${o.car} · ${o.zone}</div></div>`; }
  const col = PROTO[c.protocol].color;
  return `<div class="conn" data-id="${o.id}" title="${esc(c.description)}">
    ${dirMark(l)}
    <div class="nm">${iconOf(o)}<code>${o.id}</code>${esc(o.name)}</div>
    <span class="proto" style="background:${col}22;color:${col}">${esc(c.protocolName)}</span>
    <div class="meta">${esc(c.bandwidth)} · ${c.cableId || c.channel}${c.redundant ? ' · 이중화' : ''} · ${esc(c.description)}</div></div>`;
}
// 연결 방향 표시: 상하위가 분명하면 ↑/↓, 양방향 통신이면 ⇄
const dirMark = (l) => l.c.direction === 'bidirectional'
  ? `<span class="dir bi" title="양방향 통신 (상하위 구분 없음)">⇄</span>`
  : `<span class="dir" title="${l.dir === 'in' ? '상위: 이 장비에 전원·제어를 주는 쪽' : '하위: 이 장비가 전원·제어를 주는 쪽'}">${l.dir === 'in' ? '↑' : '↓'}</span>`;
// 펼침형 연결 행: 행 클릭 = 그 장비의 연결 장치 펼치기/접기, → 버튼 = 그 장비로 이동
function connRowX(l, topSet) {
  const o = EQ.get(l.other), c = l.c, col = PROTO[c.protocol].color, open = state.expanded === o.id;
  const sub = ADJ.get(o.id);
  const iss = ISSUE_BY_CONN.get(c.id);
  let h = `<div class="conn x ${open ? 'open' : ''} ${iss ? 'issue' : ''}" data-x="${o.id}" title="클릭: 연결 장치 펼치기">
    ${dirMark(l)}
    <div class="nm"><span class="caret">${open ? '▾' : '▸'}</span>${iconOf(o)}<code>${o.id}</code><span class="nmt">${esc(o.name)}</span></div>
    <button class="go" data-go="${o.id}" title="이 장비로 이동">→</button>
    <div class="meta"><span class="proto" style="background:${col}22;color:${col}">${esc(c.protocolName)}</span> ${esc(c.bandwidth)} · ${c.cableId || c.channel}${c.redundant ? ' · 이중화' : ''} · 연결 ${sub.length}${iss ? ` · <span class="isstag">⚠ 장치 간 문제 ${iss.id}</span>` : ''}</div></div>`;
  if (open) {
    h += `<div class="sub"><div class="subh">${iconOf(o)} <b>${esc(o.name)}</b>의 연결 장치 <span class="n">${sub.length}</span></div><div class="sublist">`
      + sub.map((s2) => {
        const x = EQ.get(s2.other), pc = PROTO[s2.c.protocol].color;
        const cur = x.id === state.selected, dup = !cur && topSet.has(x.id);
        return `<div class="si${cur || dup ? ' dup' : ''}">
            ${dirMark(s2)}
            <div class="nm">${iconOf(x)}<div class="nmc"><div><code>${x.id}</code></div><div class="nmt">${esc(x.name)}</div></div></div>
            ${cur ? '<span></span>' : `<button class="go" data-go="${x.id}" title="이 장비로 이동">→</button>`}
            <div class="sm">${cur ? '<span class="dupb">↺ 현재 장비</span>' : dup ? '<span class="dupb">↺ 위에 표시됨</span>' : ''}<span class="proto" style="background:${pc}22;color:${pc}">${esc(s2.c.protocolName)}</span></div>
          </div>`;
      }).join('')
      + `</div></div>`;
  }
  return h;
}
function bindRows(P) {
  P.querySelectorAll('.conn.x').forEach((r) => (r.onclick = (ev) => {
    if (ev.target.closest('.go')) return;
    const id = r.dataset.x; state.expanded = state.expanded === id ? null : id; recomputeHL(); refresh();
  }));
  P.querySelectorAll('.go[data-go]').forEach((b) => (b.onclick = (ev) => { ev.stopPropagation(); select(b.dataset.go, { from: 'panel' }); }));
  P.querySelectorAll('.conn[data-id]').forEach((r) => (r.onclick = () => select(r.dataset.id, { from: 'panel' })));
}


