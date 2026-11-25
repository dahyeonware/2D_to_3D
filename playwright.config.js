// 화면 스모크 테스트 (WORK_ORDER 7.1). 별도 DB(data/e2e.db)와 포트(3100)로 빌드본을 띄워 시험한다.
// 브라우저: 기본은 PC에 설치된 Microsoft Edge 사용 (추가 다운로드 불필요).
//   Chromium을 쓰려면: npx playwright install chromium 후 PW_CHANNEL=chromium npm run test:e2e
import { defineConfig } from '@playwright/test';

const PORT = 3100;
const channel = process.env.PW_CHANNEL ?? 'msedge';

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1440, height: 860 },
    ...(channel === 'chromium' ? {} : { channel }),
  },
  webServer: {
    command: 'npm run build && node scripts/db-reset.js && node server/src/index.js',
    url: `http://localhost:${PORT}/api/health`,
    timeout: 120_000,
    reuseExistingServer: false,
    env: { PORT: String(PORT), DB_PATH: './data/e2e.db', DEMO_MODE: '1' },
  },
});
