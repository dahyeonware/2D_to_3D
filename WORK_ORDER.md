# 작업지시서 — KTX 장비 위치·연결 관계 시각화 웹앱 (로컬 구동 + SQLite)

| 항목 | 내용 |
|---|---|
| 문서 목적 | 해커톤 프로토타입(단일 HTML)을 **데이터베이스 기반 웹앱**으로 전환하기 위한 개발 작업 지시 |
| 1차 목표 | 개발자 PC에서 `npm run dev` 한 번으로 구동되는 로컬 웹앱 (SQLite) |
| 기준 화면 | `prototype/index.html` (현재 아티팩트와 동일한 화면·기능) |
| 시드 데이터 | `seed/*.json` (현재 화면에 들어 있는 가상 데이터를 그대로 추출) |
| 범위 밖 | 클라우드 배포, 실제 TCMS/정비 시스템 실시간 연동 (설계만 반영, 9장 참고) |

> ⚠️ 시드 데이터(장비 배치·치수·정비 내역·매뉴얼)는 모두 **가상 데이터**입니다. 실제 작업·안전 판단에 사용하지 않습니다. 화면 하단의 가상 데이터 고지 문구는 유지합니다.

---

## 0. 현재 상태 요약 (프로토타입)

- 파일 1개(`index.html`)에 HTML·CSS·JS·데이터가 모두 들어 있음. Three.js는 CDN에서 로드.
- 데이터는 JS 상수로 하드코딩: `TRAINSET`, `EQUIPMENT`, `CONNECTIONS`, `ISSUES`, `MAINTENANCE`, `MANUALS`.
- 그래프 분석(연결 탐색·장애 영향·상위 경로)은 브라우저에서 계산.
- 저장 기능 없음. 정비 내역·상태·이슈를 추가하거나 수정할 수 없음.

**구현되어 있어 그대로 옮길 기능 (회귀 금지 목록)**

| # | 기능 |
|---|---|
| F1 | 2D 도면(평면도·측면도, 줌/팬, 미니맵, 확대 시 실제 크기 외곽선, 장비별 도면 아이콘) |
| F2 | 3D 차량 뷰(차체·대차·팬터그래프·전차선, 반투명 차체, 음영 튜브, 튜브 안을 흐르는 빛, 양방향 연결은 양쪽으로 흐름) |
| F3 | 2D ↔ 3D 양방향 선택 연동, 선택 장비 재클릭 시 초기화 |
| F4 | 연결 탐색(1~3 hop), 장애 영향 분석, 상위 경로 추적, 고장 시뮬레이션 |
| F5 | 정보 패널: 정보·연결 / 정비 내역(최신순) / 정비 매뉴얼 탭, 매뉴얼 상세 창(체크리스트, 고장 코드 강조) |
| F6 | 연결 목록 1단계 펼침(스크롤), 행별 이동(→) 버튼, 중복 표시(↺), ↑상위·↓하위·⇄양방향 표시 |
| F7 | 고장·주의 원인 박스, 장치 간 문제 박스(상대 장치 이동) |
| F8 | 경고 아이콘(고장 = 빨간 삼각형, 주의 = 노란 원), 미니맵 경고 |
| F9 | 장치 간 문제 표시(직접 연결 → 연결선 깜빡임, 연결 없음 → 주황 점선 이슈선) |
| F10 | 무선 장비 선택 시 [무선 범위 보기] 버튼 → 파동 표시 |
| F11 | 돌아가기 / 앞으로 가기 내비게이션 |
| F12 | 창 분할선 드래그 크기 조절(브라우저 저장), 드래그 시 글자 선택 차단 |
| F13 | 검색, 차량·상태·분류·유선/무선 필터, 범례 |
| F14 | 데모 시나리오 1~5 |

---

## 1. 목표 아키텍처

```
┌──────────────── 브라우저 ────────────────┐
│  web/ (Vite + Vanilla JS 모듈 + Three.js) │
│   - 2D 도면, 3D 뷰, 정보 패널, 관리 화면   │
└───────────────▲──────────────────────────┘
                │  REST(JSON) + SSE(상태 변경 알림)
┌───────────────┴──────────────────────────┐
│  server/ (Node.js 20 + Express)           │
│   - API, 그래프 분석, CSV 가져오기, 파일 업로드 │
│   - better-sqlite3 (동기식 SQLite 드라이버)  │
└───────────────▲──────────────────────────┘
                │
        data/ktx.db (SQLite, WAL 모드)
        data/uploads/ (도면·3D 모델·매뉴얼 PDF)
```

**기술 선택과 이유**

| 영역 | 선택 | 이유 |
|---|---|---|
| 런타임 | Node.js 20 LTS | 프론트와 같은 언어(JS)로 팀 전체가 작업 가능 |
| 서버 | Express 4 | 해커톤 팀에 가장 익숙한 프레임워크, 미들웨어 풍부 |
| DB 드라이버 | better-sqlite3 | 설치 간단, 동기 API로 코드 단순, 로컬 단일 사용자에 충분 |
| 프론트 빌드 | Vite 5 | 개발 서버 + `/api` 프록시, Three.js를 npm으로 번들 |
| 프론트 프레임워크 | 없음(Vanilla JS 모듈) | 프로토타입 코드를 거의 그대로 재사용. React 전환은 범위 밖 |
| 테스트 | Vitest + Supertest, Playwright | API 단위 테스트, 화면 스모크 테스트 |
| 입력 검증 | zod | API 요청 본문 검증 |

> 대안: 팀이 Python에 익숙하면 FastAPI + sqlite3로 대체 가능. 이 문서의 DB 스키마와 API 명세는 그대로 사용합니다.

---

## 2. 폴더 구조

```
ktx-equipment-viewer/
├─ package.json              # 루트: npm workspaces (server, web) + 공통 스크립트
├─ .env.example              # PORT, DB_PATH, UPLOAD_DIR, DEMO_MODE
├─ README.md                 # 실행 방법 (6장 내용)
├─ data/                     # (git 제외) ktx.db, uploads/
├─ db/
│  ├─ schema.sql             # 4장 DDL 전체
│  ├─ views.sql              # 4.4 뷰
│  └─ seed/                  # ← 전달한 seed/*.json 복사
├─ scripts/
│  ├─ db-init.js             # schema.sql + views.sql 실행 → seed 적재
│  ├─ db-reset.js            # DB 파일 삭제 후 db-init
│  └─ check-integrity.js     # 7.2 무결성 검사
├─ server/
│  ├─ src/
│  │  ├─ index.js            # Express 앱, 정적 파일(web/dist) 서빙
│  │  ├─ db.js               # better-sqlite3 연결, PRAGMA 설정
│  │  ├─ routes/             # trainsets, equipment, connections, maintenance,
│  │  │                      # manuals, issues, graph, search, import, events, files
│  │  ├─ services/graph.js   # neighbors / impact / upstream (프로토타입 로직 이전)
│  │  ├─ services/status.js  # 유효 상태 계산 (4.4 뷰 사용)
│  │  └─ mappers.js          # DB 행(snake_case) ↔ API 응답(camelCase, 프로토타입 형식)
│  └─ test/
└─ web/
   ├─ index.html
   ├─ vite.config.js         # /api → http://localhost:3000 프록시
   └─ src/
      ├─ main.js             # 부트스트랩: API 호출 → 상태 초기화 → 화면 생성
      ├─ api.js              # fetch 래퍼
      ├─ state.js            # 선택·모드·필터·이력 상태
      ├─ view2d/             # 도면, 미니맵, 아이콘, 외곽선
      ├─ view3d/             # Three.js 씬, 튜브, 빛, 파동
      ├─ panel/              # 정보·정비·매뉴얼·원인·장치 간 문제
      ├─ admin/              # 관리 화면 (3장 P1)
      ├─ icons.js            # 장비 아이콘 (DB의 equipment_types.icon_svg 사용)
      └─ styles.css
```

---

## 3. 실제 동작을 위해 추가할 개발 기능

우선순위: **P0** = 로컬 웹앱 1차 완료 조건, **P1** = 실사용에 필요, **P2** = 실제 차량 데이터 연계 단계.

### 3.1 P0 — DB 기반으로 전환 (1차 완료 조건)

| ID | 기능 | 내용 | 완료 기준 |
|---|---|---|---|
| P0-1 | 프로젝트 골격 | 2장 구조로 저장소 생성, workspaces, ESLint/Prettier | `npm install` 성공 |
| P0-2 | DB 스키마·시드 | 4장 DDL 생성, `seed/*.json` 적재 스크립트 | `npm run db:init` 후 장비 105, 연결 131, 이슈 2, 정비 416, 매뉴얼 27건 |
| P0-3 | 조회 API | 5장 GET 엔드포인트 전체 | Supertest 통과 |
| P0-4 | 부트스트랩 API | `GET /api/trainsets/:id/bootstrap`이 프로토타입 상수와 **같은 형태**로 반환 | 프로토타입 상수와 JSON 비교 시 동일 |
| P0-5 | 프론트 분리 | `index.html`의 CSS/JS를 `web/src/*`로 분리, Three.js를 npm 패키지로 | 화면이 프로토타입과 동일하게 보임 |
| P0-6 | 데이터 로딩 교체 | 하드코딩 상수 제거 → 부트스트랩 API로 대체. 정비 내역·매뉴얼은 장비 선택 시 지연 로딩 | 네트워크 탭에서 API 호출 확인 |
| P0-7 | 상태 계산 일원화 | 유효 상태 = 장비 자체 상태, 열린 장치 간 문제 심각도 중 높은 값 → 서버 뷰에서 계산해 내려줌. 고장 시뮬레이션은 **클라이언트 전용**(DB에 쓰지 않음) | 경고 아이콘 결과가 프로토타입과 동일 |
| P0-8 | 정비 내역 등록 | 정비 탭에 [내역 추가] 폼 → `POST /api/equipment/:id/maintenance`. 저장 후 최신순 재조회, 최근 점검일 자동 갱신 | 새로고침 후에도 유지 |
| P0-9 | 장비 상태 변경 | 패널에서 상태(정상·주의·고장) 변경 + 사유 입력 → `status_events`에 이력 저장 | 상태 이력 조회 가능 |
| P0-10 | 장치 간 문제 처리 | 이슈 상태 변경(조치 예정 → 조치 중 → 조치 완료). 완료 시 경고 해제 | 완료 처리 후 아이콘·이슈선 사라짐 |
| P0-11 | 실행 스크립트 | `dev`, `build`, `start`, `db:init`, `db:reset`, `test` | 6장 절차대로 구동 |
| P0-12 | 회귀 확인 | 0장 F1~F14 동작 확인, 시나리오 1~5 콘솔 오류 없음 | Playwright 스모크 통과 |

### 3.2 P1 — 실사용 기능

| ID | 기능 | 내용 |
|---|---|---|
| P1-1 | 관리 화면 | 장비·연결·장치 간 문제 CRUD (`/admin`). 장비 좌표는 2D 도면에서 **클릭해서 지정**, 3D 좌표는 높이만 입력 |
| P1-2 | CSV/엑셀 일괄 가져오기 | 장비·연결 목록을 CSV(xlsx)로 업로드 → 검증 결과 미리보기 → 반영. 현장 장비 목록은 대부분 엑셀이므로 필수 |
| P1-3 | 도면 업로드·정합 | 실제 2D 도면(SVG/PNG/PDF→이미지)을 배경으로 업로드. **기준점 2개**를 찍어 도면 좌표 ↔ 미터 좌표 변환값을 `drawings.calibration`에 저장 |
| P1-4 | 3D 모델 교체 | 차량별 glTF/GLB 업로드 → 박스 차체 대신 로딩. 위치·축척·회전 보정값 저장 (`models_3d`) |
| P1-5 | 매뉴얼 관리 | 매뉴얼 개정 등록(문서번호·Rev), 절차·고장 코드 편집, 원본 PDF 첨부·열람 |
| P1-6 | 로그인·권한 | 역할 3종: 조회자 / 정비원(정비 내역·상태 입력) / 관리자(마스터 데이터). 세션 쿠키 + bcrypt |
| P1-7 | 감사 로그 | 모든 쓰기 요청을 `audit_log`에 기록(누가·언제·무엇을·이전값·이후값) |
| P1-8 | 상태 변경 실시간 반영 | `GET /api/events`(SSE)로 다른 사용자의 상태·이슈 변경을 즉시 화면에 반영 |
| P1-9 | 다중 편성 | 편성 선택 드롭다운. 장비 ID는 편성 내 고유, DB 키는 편성 ID 포함 |
| P1-10 | 백업 | `npm run db:backup` → `data/backup/ktx-YYYYMMDD-HHmm.db` (SQLite online backup API) |

### 3.3 P2 — 실제 차량 데이터 연계 (설계만, 이번 범위 밖)

| ID | 기능 | 내용 |
|---|---|---|
| P2-1 | TCMS 고장 이력 수집 | TCMS 다운로드 로그(CSV 등)를 주기적으로 가져와 `status_events`·`maintenance_records`로 변환 |
| P2-2 | 장치 간 문제 자동 탐지 | 두 장비 이벤트의 시간 상관 분석 → 후보 이슈 생성(사람이 확정). 현재 `evidence` 문구를 자동 생성 |
| P2-3 | 정비 시스템 연동 | 기존 정비 시스템 API와 정비 내역 동기화 (`external_ref` 컬럼 사용) |
| P2-4 | 배포 | Docker 이미지, 사내 서버 배포, HTTPS, 사내 계정 SSO |

---

## 4. SQLite 데이터베이스

### 4.1 연결 설정 (server/src/db.js)

```js
import Database from 'better-sqlite3';
export const db = new Database(process.env.DB_PATH ?? './data/ktx.db');
db.pragma('journal_mode = WAL');   // 읽기·쓰기 동시성
db.pragma('foreign_keys = ON');    // 외래키 강제 (SQLite 기본값은 OFF)
db.pragma('busy_timeout = 5000');
```

### 4.2 관계 요약

```
trainsets 1─N cars 1─N equipment N─1 equipment_types N─1 categories
trainsets 1─N bogies
equipment 1─N connections(from/to) N─1 protocols
equipment 1─N maintenance_records ─(fault_code)→ fault_codes N─1 manuals N─1 equipment_types
equipment_issues 1─N issue_devices N─1 equipment ; equipment_issues N─1 connections(선택)
equipment 1─N status_events ; users 1─N audit_log
trainsets 1─N drawings ; cars 1─N models_3d
```

### 4.3 DDL (`db/schema.sql`)

```sql
-- ===== 기준 정보 =====
CREATE TABLE categories (
  code        TEXT PRIMARY KEY,                -- '제어', '추진·전력', ...
  name        TEXT NOT NULL,
  color       TEXT NOT NULL,                   -- '#4fc3f7'
  sort        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE equipment_types (
  code        TEXT PRIMARY KEY,                -- 'TCMS', 'DCU', ...
  name        TEXT NOT NULL,
  category    TEXT NOT NULL REFERENCES categories(code),
  icon_svg    TEXT NOT NULL,                   -- 도면 아이콘 (viewBox -12~12 선화)
  dim_l REAL, dim_w REAL, dim_h REAL           -- 기본 외형 치수(m)
);

CREATE TABLE protocols (
  code        TEXT PRIMARY KEY,                -- 'ETB', 'MVB', 'LTER', ...
  name        TEXT NOT NULL,
  bandwidth   TEXT,
  layer       TEXT NOT NULL CHECK (layer IN ('data','power')),
  medium      TEXT NOT NULL CHECK (medium IN ('wired','wireless')),
  color       TEXT NOT NULL
);

-- ===== 편성·차량 =====
CREATE TABLE trainsets (
  id           INTEGER PRIMARY KEY,
  name         TEXT NOT NULL,                  -- 'KTX-산천 (가상 편성 0371)'
  drawing_no   TEXT,
  total_length REAL NOT NULL,
  width        REAL NOT NULL,
  height       REAL NOT NULL,
  note         TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE cars (
  id           INTEGER PRIMARY KEY,
  trainset_id  INTEGER NOT NULL REFERENCES trainsets(id) ON DELETE CASCADE,
  code         TEXT NOT NULL,                  -- 'PC1', 'MC1', 'T1' ...
  name         TEXT NOT NULL,                  -- '동력차', '객차(특실)'
  type         TEXT NOT NULL CHECK (type IN ('PC','MC','T')),
  seq          INTEGER NOT NULL,               -- 편성 내 순서
  start_x      REAL NOT NULL,                  -- 편성 기준 시작 x(m)
  length       REAL NOT NULL,
  side         TEXT CHECK (side IN ('front','rear')),
  UNIQUE (trainset_id, code)
);

CREATE TABLE bogies (
  id           INTEGER PRIMARY KEY,
  trainset_id  INTEGER NOT NULL REFERENCES trainsets(id) ON DELETE CASCADE,
  car_id       INTEGER REFERENCES cars(id),    -- 관절대차는 NULL
  x            REAL NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('motor','articulated','trailer'))
);

-- ===== 장비 =====
-- 좌표계: x = 편성 길이 방향(m, PC1 앞단 = 0), y = 레일면 기준 높이, z(=pos2d_y) = 횡방향(+ 우측)
CREATE TABLE equipment (
  id            TEXT NOT NULL,                 -- 'PC1-TCMS-01' (편성 내 고유)
  trainset_id   INTEGER NOT NULL REFERENCES trainsets(id) ON DELETE CASCADE,
  car_id        INTEGER REFERENCES cars(id),   -- 지상설비는 NULL
  type_code     TEXT NOT NULL REFERENCES equipment_types(code),
  idx           INTEGER NOT NULL DEFAULT 1,
  name          TEXT NOT NULL,
  zone          TEXT NOT NULL,                 -- 운전실, 기계실, 객실, 지붕, 차체 하부, 대차, 연결부, 선로변, 궤도
  pos2d_x REAL NOT NULL, pos2d_y REAL NOT NULL,
  pos3d_x REAL NOT NULL, pos3d_y REAL NOT NULL, pos3d_z REAL NOT NULL,
  dim_l REAL, dim_w REAL, dim_h REAL,          -- NULL이면 equipment_types 기본값
  manufacturer  TEXT,
  model         TEXT,
  install_date  TEXT,                          -- 'YYYY-MM-DD'
  status        TEXT NOT NULL DEFAULT '정상' CHECK (status IN ('정상','주의','고장')),
  description   TEXT,
  external_ref  TEXT,                          -- 외부 시스템 장비 코드(P2)
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (trainset_id, id)
);
CREATE INDEX ix_equipment_car ON equipment(car_id);
CREATE INDEX ix_equipment_status ON equipment(trainset_id, status);

-- ===== 연결 =====
-- 방향: from = 상위(전원·제어를 주는 쪽), to = 하위. direction='bidirectional'이면 상하위 구분 없음(⇄)
CREATE TABLE connections (
  id            TEXT NOT NULL,                 -- 'C001'
  trainset_id   INTEGER NOT NULL,
  from_eq       TEXT NOT NULL,
  to_eq         TEXT NOT NULL,
  protocol_code TEXT NOT NULL REFERENCES protocols(code),
  direction     TEXT NOT NULL DEFAULT 'downstream' CHECK (direction IN ('downstream','bidirectional')),
  redundant     INTEGER NOT NULL DEFAULT 0 CHECK (redundant IN (0,1)),  -- 이중화: 장애 영향 분석에서 제외
  cable_id      TEXT,                          -- 유선
  channel       TEXT,                          -- 무선
  description   TEXT,
  PRIMARY KEY (trainset_id, id),
  FOREIGN KEY (trainset_id, from_eq) REFERENCES equipment(trainset_id, id) ON DELETE CASCADE,
  FOREIGN KEY (trainset_id, to_eq)   REFERENCES equipment(trainset_id, id) ON DELETE CASCADE,
  CHECK (from_eq <> to_eq)
);
CREATE INDEX ix_conn_from ON connections(trainset_id, from_eq);
CREATE INDEX ix_conn_to   ON connections(trainset_id, to_eq);

-- ===== 정비 매뉴얼 =====
CREATE TABLE manuals (
  id            INTEGER PRIMARY KEY,
  type_code     TEXT NOT NULL REFERENCES equipment_types(code),
  doc_no        TEXT NOT NULL,
  rev           TEXT NOT NULL,
  title         TEXT NOT NULL,
  is_current    INTEGER NOT NULL DEFAULT 1,    -- 개정 이력 중 현행본
  pdf_path      TEXT,                          -- 원본 첨부(P1-5)
  is_virtual    INTEGER NOT NULL DEFAULT 1,    -- 가상 매뉴얼 표시 여부
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (doc_no, rev)
);
CREATE UNIQUE INDEX ux_manual_current ON manuals(type_code) WHERE is_current = 1;

CREATE TABLE manual_items (                    -- 점검 주기·안전 조치·점검 절차·필요 공구
  manual_id     INTEGER NOT NULL REFERENCES manuals(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('interval','safety','step','tool')),
  seq           INTEGER NOT NULL,
  text          TEXT NOT NULL,
  PRIMARY KEY (manual_id, kind, seq)
);

CREATE TABLE fault_codes (
  code          TEXT PRIMARY KEY,              -- 'DR-201'
  manual_id     INTEGER NOT NULL REFERENCES manuals(id) ON DELETE CASCADE,
  symptom       TEXT NOT NULL,
  action        TEXT NOT NULL
);

-- ===== 정비 내역 =====
CREATE TABLE maintenance_records (
  id            TEXT PRIMARY KEY,              -- 'MR-T3-DCU-01-03'
  trainset_id   INTEGER NOT NULL,
  equipment_id  TEXT NOT NULL,
  date          TEXT NOT NULL,                 -- 'YYYY-MM-DD'
  type          TEXT NOT NULL CHECK (type IN ('정기점검','부품교체','고장수리','개량')),
  team          TEXT,
  hours         REAL,
  summary       TEXT NOT NULL,
  parts         TEXT,
  result        TEXT NOT NULL,                 -- 정상 / 관찰 중 / 조치 대기 ...
  fault_code    TEXT REFERENCES fault_codes(code),
  created_by    INTEGER REFERENCES users(id),
  external_ref  TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (trainset_id, equipment_id) REFERENCES equipment(trainset_id, id) ON DELETE CASCADE
);
CREATE INDEX ix_maint_eq_date ON maintenance_records(trainset_id, equipment_id, date DESC);

-- ===== 장치 간 문제 =====
CREATE TABLE equipment_issues (
  id            TEXT PRIMARY KEY,              -- 'IS-01'
  trainset_id   INTEGER NOT NULL REFERENCES trainsets(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  type          TEXT NOT NULL,                 -- 통신 품질, 전자기 간섭(EMI), 동기·이중화, 호환 ...
  severity      TEXT NOT NULL CHECK (severity IN ('주의','고장')),
  cause         TEXT,
  evidence      TEXT,                          -- 진단 근거
  action        TEXT,
  status        TEXT NOT NULL DEFAULT '조치 예정' CHECK (status IN ('원인 분석 중','원인 분석 완료','조치 예정','조치 중','조치 완료')),
  connection_id TEXT,                          -- 두 장치를 직접 잇는 연결 (없으면 NULL → 이슈선 표시)
  since         TEXT NOT NULL,
  closed_at     TEXT,
  FOREIGN KEY (trainset_id, connection_id) REFERENCES connections(trainset_id, id)
);

CREATE TABLE issue_devices (
  issue_id      TEXT NOT NULL REFERENCES equipment_issues(id) ON DELETE CASCADE,
  trainset_id   INTEGER NOT NULL,
  equipment_id  TEXT NOT NULL,
  PRIMARY KEY (issue_id, equipment_id),
  FOREIGN KEY (trainset_id, equipment_id) REFERENCES equipment(trainset_id, id) ON DELETE CASCADE
);

-- ===== 상태 이력 =====
CREATE TABLE status_events (
  id            INTEGER PRIMARY KEY,
  trainset_id   INTEGER NOT NULL,
  equipment_id  TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('정상','주의','고장')),
  source        TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','import','tcms')),
  note          TEXT,
  created_by    INTEGER REFERENCES users(id),
  at            TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (trainset_id, equipment_id) REFERENCES equipment(trainset_id, id) ON DELETE CASCADE
);
CREATE INDEX ix_status_eq ON status_events(trainset_id, equipment_id, at DESC);

-- ===== 도면·3D 모델 (P1) =====
CREATE TABLE drawings (
  id            INTEGER PRIMARY KEY,
  trainset_id   INTEGER NOT NULL REFERENCES trainsets(id) ON DELETE CASCADE,
  view          TEXT NOT NULL CHECK (view IN ('plan','side')),
  file_path     TEXT NOT NULL,
  calibration   TEXT,                          -- JSON: {"p1":{"px":..,"py":..,"x":..,"y":..},"p2":{...}}
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE models_3d (
  id            INTEGER PRIMARY KEY,
  car_id        INTEGER NOT NULL REFERENCES cars(id) ON DELETE CASCADE,
  file_path     TEXT NOT NULL,                 -- .glb
  transform     TEXT,                          -- JSON: {"position":[x,y,z],"rotation":[..],"scale":s}
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ===== 사용자·감사 (P1) =====
CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  login         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('viewer','technician','admin')),
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE audit_log (
  id            INTEGER PRIMARY KEY,
  user_id       INTEGER REFERENCES users(id),
  action        TEXT NOT NULL,                 -- 'create','update','delete'
  entity        TEXT NOT NULL,                 -- 테이블명
  entity_id     TEXT NOT NULL,
  before_json   TEXT,
  after_json    TEXT,
  at            TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### 4.4 뷰 (`db/views.sql`)

```sql
-- 장비 유효 상태 = 장비 자체 상태와 '조치 완료' 아닌 장치 간 문제 심각도 중 높은 값
CREATE VIEW v_equipment_effective_status AS
SELECT e.trainset_id, e.id AS equipment_id, e.status AS own_status,
       CASE MAX(
              CASE e.status WHEN '고장' THEN 2 WHEN '주의' THEN 1 ELSE 0 END,
              COALESCE(MAX(CASE i.severity WHEN '고장' THEN 2 WHEN '주의' THEN 1 END), 0))
         WHEN 2 THEN '고장' WHEN 1 THEN '주의' ELSE '정상' END AS effective_status
FROM equipment e
LEFT JOIN issue_devices d ON d.trainset_id = e.trainset_id AND d.equipment_id = e.id
LEFT JOIN equipment_issues i ON i.id = d.issue_id AND i.status <> '조치 완료'
GROUP BY e.trainset_id, e.id;

-- 최근 점검일 = 가장 최근 '정기점검' 날짜 (프로토타입의 lastInspection)
CREATE VIEW v_last_inspection AS
SELECT trainset_id, equipment_id, MAX(date) AS last_inspection
FROM maintenance_records WHERE type = '정기점검'
GROUP BY trainset_id, equipment_id;
```

> `equipment.status`에는 **장비 자체** 상태만 저장합니다. 장치 간 문제로 생긴 주의·고장은 뷰에서 계산하므로, 이슈를 조치 완료하면 자동으로 경고가 풀립니다.

### 4.5 시드 적재 규칙 (`scripts/db-init.js`)

| 시드 파일 | 대상 테이블 | 변환 규칙 |
|---|---|---|
| `reference.json` | categories, protocols, equipment_types | `equipmentTypes[].dims` → dim_l/w/h |
| `trainset.json` | trainsets, cars, bogies | `cars[].start` → start_x, 배열 순서 → seq. `bogies[].car`(코드) → car_id |
| `equipment.json` | equipment | `code` → type_code, `car`(코드) → car_id (`'지상'`이면 NULL), pos/dims 펼치기. `lastInspection`은 **저장하지 않음**(뷰로 계산) |
| `connections.json` | connections | `from`/`to` → from_eq/to_eq, `protocol` → protocol_code, `redundant` 없으면 0. `type`, `protocolName`, `bandwidth`, `layer`는 protocols에서 조인하므로 저장하지 않음 |
| `manuals.json` | manuals, manual_items, fault_codes | 키 = type_code. interval/safety/steps/tools → manual_items(kind별 seq). is_virtual = 1 |
| `maintenance.json` | maintenance_records | 키 = equipment_id, 배열 그대로. `faultCode` → fault_code |
| `issues.json` | equipment_issues, issue_devices | `devices[]` → issue_devices 2행, `connection` → connection_id |

- 모든 적재는 **하나의 트랜잭션**으로 처리. 실패 시 전체 롤백.
- 적재 후 `scripts/check-integrity.js` 자동 실행 (7.2).

---

## 5. API 명세

공통: JSON, UTF-8. 오류는 `{ "error": { "code": "NOT_FOUND", "message": "..." } }`. 응답 필드는 **프로토타입과 같은 camelCase 이름**을 씁니다(`pos2d`, `pos3d`, `dims`, `lastInspection`, `protocolName` …). 그래야 프론트 코드 변경이 최소가 됩니다.

### 5.1 조회 (P0)

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/health` | `{ok:true, db:"ktx.db", counts:{...}}` |
| GET | `/api/reference` | 분류·프로토콜·장비 종류(아이콘 포함)·상태 색상 |
| GET | `/api/trainsets` | 편성 목록 |
| GET | `/api/trainsets/:id/bootstrap` | **화면 첫 로딩용** `{trainset, equipment, connections, issues}` — 프로토타입 상수와 동일 형태. `equipment[].status`는 **유효 상태**, `ownStatus` 별도 포함 |
| GET | `/api/trainsets/:id/equipment?car=&status=&category=&q=` | 장비 목록(필터) |
| GET | `/api/trainsets/:id/equipment/:eqId` | 장비 상세 + 직접 연결 목록 |
| GET | `/api/trainsets/:id/equipment/:eqId/maintenance?limit=5` | 정비 내역 **최신순**(date DESC, id DESC) |
| GET | `/api/trainsets/:id/equipment/:eqId/status-history` | 상태 이력 |
| GET | `/api/manuals/by-type/:typeCode` | 현행 매뉴얼 (intervals, safety, steps, tools, faults) |
| GET | `/api/fault-codes/:code` | 고장 코드 단건 |
| GET | `/api/trainsets/:id/issues?open=1` | 장치 간 문제 목록 |
| GET | `/api/trainsets/:id/graph/neighbors/:eqId?depth=1..3&wired=1&wireless=1` | `{nodes:[], edges:[], dist:{}}` |
| GET | `/api/trainsets/:id/graph/impact/:eqId` | 하위 방향, `redundant=1` 제외 |
| GET | `/api/trainsets/:id/graph/upstream/:eqId` | 상위 방향 (제어·통신 경로 / 전원 경로 각각) |
| GET | `/api/trainsets/:id/search?q=` | ID·이름·종류 코드 검색, 최대 10건 |

> 그래프 분석은 P0에서는 **프론트 로직을 유지**해도 됩니다(데이터가 100건대라 충분히 빠름). 서버 API는 같은 결과를 내도록 구현하고, 테스트로 두 결과가 같은지 비교합니다. 이후 데이터가 커지면 서버 계산으로 전환합니다.

### 5.2 쓰기

| 메서드 | 경로 | 권한(P1부터) | 설명 |
|---|---|---|---|
| POST | `/api/trainsets/:id/equipment/:eqId/maintenance` | technician | 정비 내역 등록. `id`는 서버 생성 `MR-{eqId}-{순번}` |
| PATCH | `/api/trainsets/:id/equipment/:eqId/status` | technician | `{status, note}` → equipment.status 갱신 + status_events 추가 + SSE 발행 |
| PATCH | `/api/trainsets/:id/issues/:issueId` | technician | 상태·조치 내용 변경. '조치 완료'면 closed_at 기록 |
| POST | `/api/trainsets/:id/issues` | admin | 장치 간 문제 등록. 두 장비 사이 연결이 있으면 connection_id 자동 채움 |
| POST / PATCH / DELETE | `/api/trainsets/:id/equipment[/:eqId]` | admin | 장비 CRUD (P1-1) |
| POST / PATCH / DELETE | `/api/trainsets/:id/connections[/:connId]` | admin | 연결 CRUD (P1-1) |
| POST | `/api/trainsets/:id/import?entity=equipment\|connections&dryRun=1` | admin | CSV·xlsx 가져오기. dryRun이면 검증 결과만 반환 (P1-2) |
| POST | `/api/files` | admin | 도면·GLB·PDF 업로드 → `data/uploads/` (multer, 50MB 제한) |
| GET | `/api/events` | viewer | SSE: `status-changed`, `issue-changed`, `maintenance-added` |

**요청 예시 — 정비 내역 등록**

```http
POST /api/trainsets/1/equipment/T3-DCU-01/maintenance
Content-Type: application/json

{ "date": "2026-11-25", "type": "고장수리", "team": "객실설비 정비팀", "hours": 1.0,
  "summary": "[DR-201] 끼임 감지 센서 교체 후 개폐 시험 정상", "parts": "끼임 감지 센서",
  "result": "정상", "faultCode": "DR-201" }
```

검증: date 형식, type 열거값, faultCode가 해당 장비 종류의 매뉴얼에 속하는지 확인.

---

## 6. 로컬 구동 구성

### 6.1 사전 준비

- Node.js 20 LTS 이상 (`node -v`)
- Windows는 better-sqlite3 설치 시 빌드 도구가 필요할 수 있음 → 대부분 미리 빌드된 바이너리로 해결되며, 실패하면 "Visual Studio Build Tools (C++)" 설치
- 확인용 DB 도구(선택): DB Browser for SQLite

### 6.2 `.env.example`

```ini
PORT=3000
DB_PATH=./data/ktx.db
UPLOAD_DIR=./data/uploads
DEMO_MODE=1            # 1이면 데모 시나리오·고장 시뮬레이션 버튼 표시
SESSION_SECRET=change-me
```

### 6.3 루트 `package.json` 스크립트

```json
{
  "private": true,
  "workspaces": ["server", "web"],
  "scripts": {
    "db:init":  "node scripts/db-init.js",
    "db:reset": "node scripts/db-reset.js",
    "db:check": "node scripts/check-integrity.js",
    "dev":      "concurrently -n api,web \"npm -w server run dev\" \"npm -w web run dev\"",
    "build":    "npm -w web run build",
    "start":    "npm -w server run start",
    "test":     "npm -w server run test && npx playwright test"
  },
  "devDependencies": { "concurrently": "^9" }
}
```

- `server` : `dev` = `node --watch src/index.js`, `start` = `NODE_ENV=production node src/index.js` (web/dist 정적 서빙)
- `web` : Vite, `vite.config.js`에서 `server.proxy = { '/api': 'http://localhost:3000' }`

### 6.4 실행 절차 (README에 그대로 기재)

```bash
git clone <repo> && cd ktx-equipment-viewer
cp .env.example .env
npm install
npm run db:init          # data/ktx.db 생성 + 시드 적재 + 무결성 검사
npm run dev              # 개발: http://localhost:5173 (API는 3000)

# 시연용 단일 포트 실행
npm run build && npm start   # http://localhost:3000
```

- 데이터를 처음 상태로 되돌리기: `npm run db:reset`
- 시연 전 권장: `db:reset` → `build` → `start` 후 시나리오 1~5 확인

---

## 7. 테스트·검증

### 7.1 자동 테스트

| 구분 | 도구 | 항목 |
|---|---|---|
| API | Vitest + Supertest | 모든 GET 200·형식, 없는 ID 404, 정비 내역 최신순·limit, 상태 변경 시 status_events 생성, 이슈 '조치 완료' 시 유효 상태 해제 |
| 그래프 | Vitest | impact(MC1-CONV-01) = 하위 13개, upstream(T3-DCU-01) 제어 경로 끝이 PC1-TCMS-01, 전원 경로 시작이 PC1-PAN-01 |
| 동등성 | Vitest | `/bootstrap` 응답 ≒ `prototype/index.html`의 상수 (lastInspection·status 포함) |
| 화면 | Playwright | 첫 화면 로딩, 시나리오 1~5 클릭 시 콘솔 오류 0, 2D 드래그 후 `getSelection()` 빈 문자열, 장비 재클릭 시 초기화, 돌아가기/앞으로 가기 |

### 7.2 무결성 검사 (`scripts/check-integrity.js`)

- `PRAGMA foreign_key_check` 결과 0건
- 모든 연결의 from/to 장비 존재, 자기 자신 연결 없음
- issue_devices가 이슈당 정확히 2행
- connection_id가 있으면 그 연결의 양 끝이 이슈의 두 장비와 일치
- fault_code가 있는 정비 내역은 해당 장비 종류의 매뉴얼 고장 코드와 일치
- 기대 건수: 장비 105 / 연결 131 / 이슈 2 / 정비 416 / 매뉴얼 27

---

## 8. 작업 순서와 완료 기준

| 단계 | 작업 | 포함 ID | 산출물 | 예상 |
|---|---|---|---|---|
| 1 | 저장소·스키마·시드 | P0-1, P0-2 | `npm run db:init` 성공, 무결성 검사 통과 | 0.5일 |
| 2 | 조회 API | P0-3, P0-4 | Supertest 통과, `/bootstrap` 동등성 확인 | 1일 |
| 3 | 프론트 분리·연결 | P0-5, P0-6, P0-7 | 프로토타입과 동일 화면, 상수 제거 | 1.5일 |
| 4 | 쓰기 기능 | P0-8, P0-9, P0-10 | 정비 등록·상태 변경·이슈 처리 후 새로고침해도 유지 | 1일 |
| 5 | 스크립트·회귀 | P0-11, P0-12 | README, Playwright 스모크 통과 | 0.5일 |
| 6 | (선택) P1 | P1-1 ~ P1-10 | 관리 화면, 가져오기, 도면 정합, 로그인 | 3~5일 |

**1차 완료 정의 (P0)**: 새 PC에서 6.4 절차만으로 구동되고, 0장 F1~F14가 프로토타입과 같게 동작하며, 정비 내역·상태·장치 간 문제 변경이 DB에 저장되어 재시작 후에도 유지됨.

---

## 9. 주의사항

1. **가상 데이터 고지 유지** — 매뉴얼의 "가상 매뉴얼 · 실제 작업에 사용 금지" 표시는 `manuals.is_virtual = 1`이면 반드시 표시.
2. **고장 시뮬레이션은 DB에 쓰지 않음** — 시연 기능이므로 클라이언트 상태로만 유지. `DEMO_MODE=0`이면 버튼 숨김.
3. **좌표 기준 고정** — x = 편성 길이 방향(PC1 앞단 0), y = 높이, z = 횡방향. 실제 도면을 붙일 때(P1-3)는 이 기준으로 변환해서 저장.
4. **연결 방향 규칙** — `from`은 상위(전원·제어를 주는 쪽). 상하위가 분명하지 않으면 `direction='bidirectional'`. 이 규칙이 장애 영향·상위 경로 분석의 기준이 됨.
5. **SQLite 한계** — 로컬·소규모 동시 사용(수 명)까지 적합. 여러 사용자가 상시 쓰는 서버 배포(P2-4) 단계에서는 PostgreSQL로 이전 검토. 스키마는 표준 SQL 위주로 작성해 이전 부담을 줄임.
6. **외부 리소스** — 폰트(Google Fonts)는 사내망에서 막힐 수 있으므로 `web/public/fonts`에 로컬 포함 권장.
7. **보안 (P1부터)** — 쓰기 API는 로그인·권한 확인 필수, 업로드 파일은 확장자·MIME·크기 검사, SQL은 모두 prepared statement.

---

## 부록 A. 전달 파일

| 경로 | 내용 |
|---|---|
| `WORK_ORDER.md` | 이 문서 |
| `prototype/index.html` | 현재 화면 (기준 동작). 브라우저로 바로 열어 확인 가능 |
| `seed/reference.json` | 분류 6, 프로토콜 14, 장비 종류 27(아이콘 SVG·기본 치수 포함) |
| `seed/trainset.json` | 편성 1, 차량 10, 대차 13 |
| `seed/equipment.json` | 장비 105 |
| `seed/connections.json` | 연결 131 (유선 122, 무선 9, 양방향 25) |
| `seed/issues.json` | 장치 간 문제 2 |
| `seed/maintenance.json` | 정비 내역 416 (장비별 3~5건, 최신순) |
| `seed/manuals.json` | 정비 매뉴얼 27 (장비 종류별) |
