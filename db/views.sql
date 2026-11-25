-- 뷰 (WORK_ORDER.md 4.4)

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
