# KTX 장비 위치·연결 관계 시각화 웹앱

해커톤 프로토타입(`prototype/index.html`)을 **SQLite 기반 로컬 웹앱**으로 옮긴 프로젝트입니다.
작업 기준은 [`WORK_ORDER.md`](WORK_ORDER.md)입니다.

> ⚠️ 모든 데이터(장비 배치·치수·정비 내역·매뉴얼)는 **가상 데이터**입니다. 실제 작업·안전 판단에 사용하지 마세요.

## 실행 방법

사전 준비: Node.js 20 LTS 이상 (`node -v`)

```bash
cp .env.example .env     # Windows PowerShell: Copy-Item .env.example .env
npm install
npm run db:init          # data/ktx.db 생성 + 시드 적재 + 무결성 검사
npm run dev              # 개발: http://localhost:5173 (API는 3000)

# 시연용 단일 포트 실행
npm run build && npm start   # http://localhost:3000
```

- 데이터를 처음 상태로 되돌리기: `npm run db:reset` (서버를 먼저 종료)
- 시연 전 권장: `db:reset` → `build` → `start` 후 시나리오 1~5 확인
- DB 백업: `npm run db:backup` → `data/backup/ktx-YYYYMMDD-HHmm.db`
- Windows에서 `better-sqlite3` 설치가 실패하면 "Visual Studio Build Tools (C++)"를 설치하세요.

## 스크립트

| 명령 | 내용 |
|---|---|
| `npm run dev` | API 서버(`node --watch`, 3000) + Vite 개발 서버(5173, `/api` 프록시) |
| `npm run build` / `npm start` | 프론트 빌드 → 서버가 `web/dist`까지 함께 서빙 |
| `npm run db:init` / `db:reset` / `db:check` | DB 생성·초기화·무결성 검사 (`db:check -- --any-counts`: 건수 비교 생략) |
| `npm test` | API 테스트(Vitest + Supertest) + 화면 스모크(Playwright) |
| `npm run test:api` / `test:e2e` | 각각만 실행 |
| `npm run lint` / `format` | ESLint / Prettier |

Playwright는 PC에 설치된 **Microsoft Edge**를 사용합니다(추가 다운로드 없음). 별도 DB(`data/e2e.db`)와
포트 3100으로 빌드본을 띄워 시험하므로 개발 DB에는 영향이 없습니다. Chromium을 쓰려면
`npx playwright install chromium` 후 `PW_CHANNEL=chromium npm run test:e2e`.

## 폴더 구조

```
├─ WORK_ORDER.md            작업지시서
├─ prototype/index.html     기준 화면 (원본 프로토타입)
├─ db/schema.sql, views.sql DDL·뷰 (지시서 4장)
├─ db/seed/*.json           시드 (프로토타입 상수와 동일)
├─ scripts/                 db-init, db-reset, check-integrity, db-backup
├─ shared/graph.js          그래프 분석 (서버·프론트 공용 — 결과 동일 보장)
├─ server/src/              Express API (app, routes/read·write, services, mappers)
├─ server/test/             API·동등성 테스트
├─ web/src/                 프론트 (Vite + Vanilla JS + Three.js npm 패키지)
│  ├─ main.js · app.js      부트스트랩 · 선택/모드/이력/시나리오/SSE
│  ├─ data.js · api.js      API 데이터 로딩·캐시 · fetch 래퍼
│  ├─ view2d/ · view3d/     2D 도면 · 3D 뷰
│  └─ panel/                정보 패널 · 쓰기 폼
└─ tests/smoke.spec.js      Playwright 스모크
```

## API 요약

조회: `/api/health`, `/api/reference`, `/api/trainsets`, `/api/trainsets/:id/bootstrap`,
`/api/trainsets/:id/equipment[/:eqId[/maintenance|/status-history]]`, `/api/manuals/by-type/:type`,
`/api/fault-codes/:code`, `/api/trainsets/:id/issues?open=1`, `/api/trainsets/:id/graph/{neighbors|impact|upstream}/:eqId`,
`/api/trainsets/:id/search?q=`

쓰기: `POST .../equipment/:eqId/maintenance`, `PATCH .../equipment/:eqId/status`, `PATCH .../issues/:issueId`,
`POST .../issues` — 모든 쓰기는 `audit_log`에 기록, `GET /api/events`(SSE)로 다른 화면에 즉시 반영.

오류 형식: `{ "error": { "code": "NOT_FOUND", "message": "..." } }`

## 배포 (GitHub + Supabase + Vercel)

| 구성 | 이름 / 주소 |
|---|---|
| GitHub | https://github.com/dahyeonware/2D_to_3D (Public) |
| Supabase | 프로젝트 `2D_to_3D` (ref `calgxaxvejyqdwrcglou`, 서울 ap-northeast-2) — Postgres |
| Vercel | 프로젝트 `2d_to_3d` (Vercel은 이름에 대문자 불가) → https://2dto3d-eta.vercel.app |

구조: Vercel이 `web/dist`(정적)를 서빙하고, `/api/*`는 서버리스 함수(`api/index.js` → 같은 Express 앱)가 처리합니다.
DB는 `DATABASE_URL`이 있으면 Postgres(Supabase 트랜잭션 풀러), 없으면 SQLite를 씁니다(같은 SQL, `server/src/db.js` 어댑터).

- **쓰기 보호**: Vercel 환경변수 `ADMIN_KEY`가 설정되어 있어 저장할 때 관리 키를 묻습니다(탭을 닫을 때까지 기억). 조회는 누구나 가능.
- **실시간 반영**: 서버리스에서는 SSE 대신 15초 폴링(`/api/trainsets/:id/live`).
- **Supabase 보안**: 모든 테이블 RLS 활성화 + anon/authenticated 권한 회수 → Supabase 자동 REST API로는 읽기·쓰기 불가.
- 비밀값(DB 비밀번호, `DATABASE_URL`, `ADMIN_KEY`)은 `.env.production.local`(git 제외)과 Vercel 환경변수에만 있습니다.

다시 배포·관리하기:

```bash
# 스키마 변경 → 새 마이그레이션 파일 추가 후
supabase db push --linked
# 배포 DB를 시드 상태로 되돌리기 (DATABASE_URL 을 .env.production.local 값으로 지정)
DATABASE_URL=... npm run db:reset
# 프로덕션 배포
vercel deploy --prod
```

GitHub push 시 자동 배포를 쓰려면 Vercel GitHub 앱에 이 저장소 접근을 허용한 뒤 `vercel git connect`를 실행하세요.

## 구현 범위

**P0 (1차 완료 조건) — 완료**

- P0-1~4 골격·스키마·시드·조회 API·부트스트랩 (프로토타입 상수와 JSON 동일 — 테스트로 확인)
- P0-5~7 프론트 모듈 분리, 하드코딩 상수 제거(정비 내역·매뉴얼은 장비 선택 시 지연 로딩), 유효 상태는 서버 뷰에서 계산, 고장 시뮬레이션은 클라이언트 전용
- P0-8 정비 내역 등록 (최근 점검일 자동 갱신) · P0-9 장비 상태 변경 + 이력 · P0-10 장치 간 문제 처리(조치 완료 시 경고·이슈선 해제)
- P0-11 실행 스크립트 · P0-12 Playwright 스모크

**P1 중 일부 선반영**: 감사 로그(P1-7, 사용자 없음), SSE 실시간 반영(P1-8), 백업(P1-10), 장치 간 문제 등록 API

**미구현 (P1 나머지)**: 관리 화면(장비·연결 CRUD), CSV/엑셀 가져오기, 도면 업로드·정합, glTF 모델 교체,
매뉴얼 관리, 로그인·권한, 다중 편성 선택 UI. 현재 쓰기 API는 **인증 없이** 열려 있으므로 로컬 전용으로 사용하세요.

## 주의

- 좌표 기준: x = 편성 길이 방향(PC1 앞단 0), y = 높이, z = 횡방향(+ 우측)
- 연결 방향: `from` = 상위(전원·제어를 주는 쪽). 상하위가 불분명하면 `direction='bidirectional'`
- `DEMO_MODE=0`이면 데모 시나리오·고장 시뮬레이션 버튼을 숨깁니다.
- 글꼴은 Google Fonts에서 받습니다. 사내망에서 막히면 시스템 글꼴로 대체됩니다 (로컬 포함은 `web/public/fonts`).
