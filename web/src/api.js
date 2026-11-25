// fetch 래퍼 — 오류 응답 { error: { code, message } } 을 Error로 변환
// 배포본처럼 쓰기가 관리 키로 보호되면(401) 키 입력 창을 띄우고 같은 요청을 다시 보낸다.
export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const KEY_STORE = 'ktx-admin-key';
const getKey = () => { try { return sessionStorage.getItem(KEY_STORE) || ''; } catch { return ''; } };
const setKey = (k) => { try { if (k) sessionStorage.setItem(KEY_STORE, k); else sessionStorage.removeItem(KEY_STORE); } catch { /* 저장 불가 */ } };

/** 관리 키 입력 창 (취소하면 null) */
function askAdminKey(retry) {
  return new Promise((resolve) => {
    const m = document.getElementById('keyModal');
    const f = m.querySelector('form');
    const input = f.elements.key;
    m.querySelector('.kerr').style.display = retry ? 'block' : 'none';
    input.value = '';
    m.classList.add('open');
    setTimeout(() => input.focus(), 30);
    const done = (v) => { m.classList.remove('open'); f.onsubmit = null; m.querySelector('[data-cancel]').onclick = null; resolve(v); };
    f.onsubmit = (ev) => { ev.preventDefault(); done(input.value.trim() || null); };
    m.querySelector('[data-cancel]').onclick = () => done(null);
  });
}

async function request(method, url, body, attempt = 0) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET' && getKey()) headers['X-Admin-Key'] = getKey();
  let res;
  try {
    res = await fetch(`/api${url}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError(0, 'NETWORK', 'API 서버에 연결할 수 없습니다');
  }
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* JSON 아님 */
  }
  if (res.status === 401 && method !== 'GET' && attempt < 3) {
    setKey('');
    const key = await askAdminKey(attempt > 0);
    if (!key) throw new ApiError(401, 'UNAUTHORIZED', '관리 키 입력이 취소되어 저장하지 않았습니다');
    setKey(key);
    return request(method, url, body, attempt + 1);
  }
  if (!res.ok) {
    throw new ApiError(res.status, json?.error?.code ?? 'HTTP', json?.error?.message ?? `HTTP ${res.status}`);
  }
  return json;
}

const enc = encodeURIComponent;

export const api = {
  get: (url) => request('GET', url),
  post: (url, body) => request('POST', url, body),
  patch: (url, body) => request('PATCH', url, body),

  reference: () => api.get('/reference'),
  trainsets: () => api.get('/trainsets'),
  bootstrap: (ts) => api.get(`/trainsets/${ts}/bootstrap`),
  live: (ts) => api.get(`/trainsets/${ts}/live`),
  maintenance: (ts, eq, limit) => api.get(`/trainsets/${ts}/equipment/${enc(eq)}/maintenance${limit ? `?limit=${limit}` : ''}`),
  statusHistory: (ts, eq) => api.get(`/trainsets/${ts}/equipment/${enc(eq)}/status-history`),
  manual: (type) => api.get(`/manuals/by-type/${enc(type)}`),
  addMaintenance: (ts, eq, body) => api.post(`/trainsets/${ts}/equipment/${enc(eq)}/maintenance`, body),
  setStatus: (ts, eq, body) => api.patch(`/trainsets/${ts}/equipment/${enc(eq)}/status`, body),
  patchIssue: (ts, id, body) => api.patch(`/trainsets/${ts}/issues/${enc(id)}`, body),
};
