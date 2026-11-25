// 쓰기 기능 UI: 정비 내역 등록(P0-8), 장비 상태 변경(P0-9), 장치 간 문제 처리(P0-10)
import { TS_ID, MANUALS, STATUS_HIST, STATUS_COLOR, ISSUES, ensureDetail, invalidateDetail } from '../data.js';
import { state, ownStatusOf } from '../state.js';
import { api } from '../api.js';
import { esc, toast } from '../ui.js';
import { afterWrite } from '../app.js';
import { renderPanel } from './index.js';

const today = () => new Date().toLocaleDateString('sv-SE');
const ISSUE_STATUSES = ['원인 분석 중', '원인 분석 완료', '조치 예정', '조치 중', '조치 완료'];

export function maintFormHTML(e) {
  const faults = MANUALS[e.code]?.faults ?? [];
  return `<form class="form" id="fMaint" autocomplete="off">
    <label>작업일<input type="date" name="date" value="${today()}" required></label>
    <label>구분<select name="type">${['정기점검', '부품교체', '고장수리', '개량'].map((t) => `<option>${t}</option>`).join('')}</select></label>
    <label>작업팀<input name="team" maxlength="60" placeholder="예: 객실설비 정비팀"></label>
    <label>작업 시간(h)<input type="number" name="hours" min="0" max="1000" step="0.5" value="1"></label>
    <label class="full">작업 내용<textarea name="summary" maxlength="500" required placeholder="예: 끼임 감지 센서 교체 후 개폐 시험 정상"></textarea></label>
    <label>교체 부품<input name="parts" maxlength="200" placeholder="없으면 비워 두기"></label>
    <label>결과<select name="result"><option>정상</option><option>관찰 중</option><option>조치 대기</option></select></label>
    <label class="full">고장 코드 (선택)<select name="faultCode"><option value="">— 없음 —</option>${faults.map((f) => `<option value="${f.code}">${f.code} · ${esc(f.symptom)}</option>`).join('')}</select></label>
    <div class="err" ></div>
    <div class="row"><button type="button" class="btn" data-cancel>취소</button><button type="submit" class="btn pri">저장</button></div>
  </form>`;
}

export function statusFormHTML(e) {
  const own = ownStatusOf(e);
  return `<form class="form" id="fEqStatus" autocomplete="off">
    <label>장비 자체 상태<select name="status">${['정상', '주의', '고장'].map((s) => `<option ${s === own ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
    <label>현재<input value="${own}${e.status !== own ? ` (유효 ${e.status} · 장치 간 문제 반영)` : ''}" disabled></label>
    <label class="full">변경 사유<textarea name="note" maxlength="500" required placeholder="예: 출입문 개폐 지연 재발 — 정밀 점검 필요"></textarea></label>
    <div class="err" ></div>
    <div class="row"><button type="button" class="btn" data-cancel>취소</button><button type="submit" class="btn pri">상태 저장</button></div>
  </form>`;
}

export function statusHistHTML(e) {
  const h = STATUS_HIST[e.id];
  if (!h) return '<div class="loading">불러오는 중…</div>';
  if (!h.length) return '<div class="empty">변경 이력 없음 (상단 [상태 변경]으로 기록)</div>';
  // DB는 UTC(datetime('now'))로 저장 → 로컬 시각으로 표시
  const local = (at) => {
    const d = new Date(`${String(at).replace(' ', 'T')}Z`);
    return Number.isNaN(d.getTime()) ? at : `${d.toLocaleDateString('sv-SE')} ${d.toTimeString().slice(0, 5)}`;
  };
  return `<ul class="hist">${h.slice(0, 20).map((r) => `<li><span class="mono">${esc(local(r.at))}</span>
    <b style="color:${STATUS_COLOR[r.status]}">${r.status}</b><span class="nt" title="${esc(r.note)}">${esc(r.note || '-')}</span></li>`).join('')}</ul>`;
}

export function issueCtlHTML(is) {
  return `<div class="isctl"><select data-issue="${is.id}" title="장치 간 문제 처리 상태">
      ${ISSUE_STATUSES.map((s) => `<option ${s === is.status ? 'selected' : ''}>${s}</option>`).join('')}
    </select><button class="btn sm" data-issue-save="${is.id}">상태 저장</button></div>`;
}

async function submit(btn, errEl, fn) {
  btn.disabled = true;
  errEl.classList.remove('on');
  try {
    await fn();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.add('on');
    toast(err.message, { error: true });
  } finally {
    btn.disabled = false;
  }
}

export function bindForms(P, e) {
  P.querySelectorAll('form [data-cancel]').forEach((b) => (b.onclick = () => { state.form = null; renderPanel(); }));

  const addBtn = P.querySelector('#btnAddMaint');
  if (addBtn) addBtn.onclick = () => { state.form = state.form === 'maint' ? null : 'maint'; renderPanel(); };

  const fm = P.querySelector('#fMaint');
  if (fm && e) fm.onsubmit = (ev) => {
    ev.preventDefault();
    const f = Object.fromEntries(new FormData(fm));
    const body = {
      date: f.date, type: f.type, team: f.team.trim(), hours: f.hours === '' ? null : Number(f.hours),
      summary: f.summary.trim(), parts: f.parts.trim() || '-', result: f.result, faultCode: f.faultCode || null,
    };
    if (body.faultCode && !body.summary.startsWith('[')) body.summary = `[${body.faultCode}] ${body.summary}`;
    submit(fm.querySelector('[type=submit]'), fm.querySelector('.err'), async () => {
      const r = await api.addMaintenance(TS_ID, e.id, body);
      state.form = null;
      invalidateDetail(e.id);
      await ensureDetail(e, { force: true });
      await afterWrite();
      toast(`정비 내역 저장: ${r.record.id}`);
    });
  };

  const fs = P.querySelector('#fEqStatus');
  if (fs && e) fs.onsubmit = (ev) => {
    ev.preventDefault();
    const f = Object.fromEntries(new FormData(fs));
    submit(fs.querySelector('[type=submit]'), fs.querySelector('.err'), async () => {
      if (!f.note.trim()) throw new Error('변경 사유를 입력하세요');
      await api.setStatus(TS_ID, e.id, { status: f.status, note: f.note.trim() });
      state.form = null;
      invalidateDetail(e.id);
      await ensureDetail(e, { force: true });
      await afterWrite();
      toast(`${e.id} 상태: ${f.status}`);
    });
  };

  P.querySelectorAll('[data-issue-save]').forEach((b) => (b.onclick = (ev) => {
    ev.stopPropagation();
    const id = b.dataset.issueSave;
    const sel = P.querySelector(`select[data-issue="${id}"]`);
    const is = ISSUES.find((x) => x.id === id);
    if (!sel || !is || sel.value === is.status) { toast('변경된 상태가 없습니다'); return; }
    if (sel.value === '조치 완료' && !confirm(`${id} "${is.title}"\n조치 완료로 처리하면 경고 아이콘과 이슈 표시가 해제됩니다. 진행할까요?`)) return;
    b.disabled = true;
    api.patchIssue(TS_ID, id, { status: sel.value })
      .then(async () => { await afterWrite(); toast(`${id} → ${sel.value}`); })
      .catch((err) => toast(err.message, { error: true }))
      .finally(() => { b.disabled = false; });
  }));
  P.querySelectorAll('select[data-issue]').forEach((s) => s.addEventListener('click', (ev) => ev.stopPropagation()));
}
