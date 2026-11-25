// 부트스트랩: API 호출 → 상태 초기화 → 화면 생성
import './styles.css';
import { loadAll } from './data.js';
import { initState } from './state.js';
import { initApp, refresh } from './app.js';
import { init2D } from './view2d/index.js';
import { init3D } from './view3d/index.js';
import { $ } from './ui.js';

async function start() {
  try {
    await loadAll();
  } catch (err) {
    $('#boot').classList.add('err');
    $('#bootMsg').innerHTML = `데이터를 불러오지 못했습니다.<br>${String(err.message).replace(/</g, '&lt;')}<br><br>
      <span style="color:var(--muted)">API 서버 실행(npm run dev) 및 DB 초기화(npm run db:init)를 확인하세요.</span><br>
      <button class="btn" style="margin-top:10px" onclick="location.reload()">다시 시도</button>`;
    return;
  }
  initState();
  initApp(); // 분할 레이아웃을 먼저 적용해야 2D/3D 크기가 맞음
  init3D();
  init2D();
  refresh();
  $('#boot').classList.add('hide');
}
start();
