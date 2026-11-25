// 화면 스모크 테스트 — 0장 F1~F14 핵심 동작, 시나리오 1~5 콘솔 오류 0 (WORK_ORDER 7.1)
import { test, expect } from '@playwright/test';

let errors;
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  await page.goto('/');
  await expect(page.locator('#boot')).toHaveClass(/hide/, { timeout: 20_000 });
});
test.afterEach(() => expect(errors).toEqual([]));

const app = (page, fn, arg) => page.evaluate(fn, arg);
const selected = (page) => app(page, () => window.__app.state.selected);

test('첫 화면 로딩: 2D 장비 105, 편성 요약, API 호출', async ({ page }) => {
  await expect(page.locator('#g2eq > g')).toHaveCount(105);
  await expect(page.locator('#panel h2')).toHaveText('KTX-산천 (가상 편성 0371)');
  await expect(page.locator('#g2warn .wm')).toHaveCount(8); // 자체 주의·고장 4 + 장치 간 문제 4
  await expect(page.locator('#view3d canvas')).toBeVisible();
});

test('데모 시나리오 1~5: 콘솔 오류 없음', async ({ page }) => {
  const expectBanner = {
    1: '연결 탐색 · 깊이 3-hop',
    2: '영향 장비 13개',
    3: 'LTE-R 통신 경로',
    4: '상위 제어·전원 경로 추적',
    5: '장치 간 문제 2건',
  };
  for (const s of [1, 2, 3, 4, 5]) {
    await page.locator(`.scen[data-s="${s}"]`).click();
    await expect(page.locator('#banner')).toContainText(expectBanner[s]);
  }
  await page.locator('#btnReset').click();
  await expect(page.locator('#banner')).not.toHaveClass(/on/);
});

test('2D 드래그 후 글자 선택 없음', async ({ page }) => {
  const box = await page.locator('#drawing').boundingBox();
  await page.mouse.move(box.x + 40, box.y + box.height - 60);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 40, box.y + 40, { steps: 12 });
  await page.mouse.up();
  expect(await page.evaluate(() => String(window.getSelection()))).toBe('');
});

test('장비 선택 · 재클릭 시 초기화 · 돌아가기/앞으로 가기', async ({ page }) => {
  await app(page, () => window.__app.select('PC1-TCMS-01', { from: 'panel' }));
  await expect(page.locator('#panel .idline').first()).toHaveText('PC1-TCMS-01');
  // 2D 아이콘 재클릭 → 초기화
  await page.waitForTimeout(600); // 2D 팬 애니메이션
  const g = page.locator('#g2eq > g[data-id="PC1-TCMS-01"]');
  await g.click({ force: true });
  expect(await selected(page)).toBeNull();

  await app(page, () => window.__app.select('PC1-TCMS-01', { from: 'panel' }));
  await page.locator('.go[data-go]').first().click();
  const second = await selected(page);
  expect(second).not.toBe('PC1-TCMS-01');
  await page.locator('#btnBack').click();
  expect(await selected(page)).toBe('PC1-TCMS-01');
  await page.locator('#btnFwd').click();
  expect(await selected(page)).toBe(second);
});

test('정보 패널 탭: 정비 내역 지연 로딩 · 매뉴얼 상세 창', async ({ page }) => {
  const maintReq = page.waitForRequest((r) => r.url().includes('/equipment/T3-DCU-01/maintenance'));
  await app(page, () => window.__app.select('T3-DCU-01', { from: 'panel' }));
  await maintReq;
  await page.locator('.ptabs button[data-tab="maint"]').click();
  await expect(page.locator('.tli').first()).toBeVisible();
  await page.locator('.ptabs button[data-tab="manual"]').click();
  await expect(page.locator('.mancard .virt')).toContainText('가상 매뉴얼');
  await page.locator('.mancard [data-openman]').click();
  await expect(page.locator('#manual')).toHaveClass(/open/);
  await expect(page.locator('.ftab tr.hit')).toHaveCount(1);
});

test('쓰기: 정비 내역 등록·상태 변경·장치 간 문제 조치 완료 → 새로고침 후 유지', async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  await app(page, () => window.__app.select('T2-HVAC-01', { from: 'panel' }));
  await page.locator('.ptabs button[data-tab="maint"]').click();
  await page.locator('#btnAddMaint').click();
  await page.locator('#fMaint [name=summary]').fill('E2E 정기점검 기록');
  await page.locator('#fMaint [name=date]').fill('2099-01-01');
  await page.locator('#fMaint [type=submit]').click();
  await expect(page.locator('.tli.first .tls')).toHaveText('E2E 정기점검 기록');

  await page.locator('#btnStatus').click();
  await page.locator('#fEqStatus [name=status]').selectOption('주의');
  await page.locator('#fEqStatus [name=note]').fill('E2E 상태 변경');
  await page.locator('#fEqStatus [type=submit]').click();
  await expect(page.locator('#panel .badge')).toHaveText('주의');

  await page.locator('#btnReset').click();
  await page.locator('select[data-issue="IS-01"]').selectOption('조치 완료');
  await page.locator('[data-issue-save="IS-01"]').click();
  await expect(page.locator('#g2warn .wm[data-id="T4-GW-01"]')).toHaveCount(0);

  await page.reload();
  await expect(page.locator('#boot')).toHaveClass(/hide/);
  await expect(page.locator('#g2warn .wm[data-id="T2-HVAC-01"]')).toHaveCount(1);
  await expect(page.locator('#g2warn .wm[data-id="T4-GW-01"]')).toHaveCount(0);
  await app(page, () => window.__app.select('T2-HVAC-01', { from: 'panel' }));
  await expect(page.locator('.hist li').first()).toContainText('E2E 상태 변경');
  await page.locator('.ptabs button[data-tab="maint"]').click();
  await expect(page.locator('.tli.first .tls')).toHaveText('E2E 정기점검 기록');
});
