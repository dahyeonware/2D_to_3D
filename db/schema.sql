-- KTX 장비 시각화 SQLite 스키마 (WORK_ORDER.md 4.3)
-- 지시서 DDL에 더해: 정렬용 sort/seq 열(Postgres에는 rowid가 없어 화면 순서를 보존하기 위함),
-- users 테이블을 앞으로 이동(Postgres는 참조 대상이 먼저 있어야 함).
-- Postgres(Supabase)용은 scripts/gen-pg-schema.js 로 이 파일에서 생성 → supabase/migrations/

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
  dim_l REAL, dim_w REAL, dim_h REAL,          -- 기본 외형 치수(m)
  sort        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE protocols (
  code        TEXT PRIMARY KEY,                -- 'ETB', 'MVB', 'LTER', ...
  name        TEXT NOT NULL,
  bandwidth   TEXT,
  layer       TEXT NOT NULL CHECK (layer IN ('data','power')),
  medium      TEXT NOT NULL CHECK (medium IN ('wired','wireless')),
  color       TEXT NOT NULL,
  sort        INTEGER NOT NULL DEFAULT 0
);

-- ===== 사용자 (P1, 정비 내역·상태 이력이 참조) =====
CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  login         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('viewer','technician','admin')),
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
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
  seq           INTEGER NOT NULL DEFAULT 0,    -- 화면 표시 순서
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
  seq           INTEGER NOT NULL DEFAULT 0,
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
  action        TEXT NOT NULL,
  seq           INTEGER NOT NULL DEFAULT 0
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
  seq           INTEGER NOT NULL DEFAULT 0,
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
