-- 샘플 데이터 (개발용). 빈 restaurants 테이블에서만 삽입하여 재실행 시 중복을 막는다.
SET NAMES utf8mb4;

INSERT INTO restaurants (name, category, status, price_level, location, memo, is_favorite)
SELECT * FROM (
  SELECT '을지로 칼국수' AS name, 'KOREAN' AS category, 'REGULAR' AS status, 1 AS price_level, '을지로3가역 근처' AS location, '점심 웨이팅 15분' AS memo, TRUE AS is_favorite
  UNION ALL SELECT '역삼 순대국', 'KOREAN', 'REGULAR', 1, '역삼역 3번 출구 앞', '깍두기가 맛있음', FALSE
  UNION ALL SELECT '홍콩반점 본점', 'CHINESE', 'REGULAR', 1, '선릉역 2번 출구', '짬뽕 추천', FALSE
  UNION ALL SELECT '마라탕 천국', 'CHINESE', 'WISHLIST', 2, '강남역 11번 출구', '지인 추천, 맵기 2단계부터', FALSE
  UNION ALL SELECT '스시 하루', 'JAPANESE', 'WISHLIST', 3, '논현동 골목', '런치 오마카세 예약 필요', TRUE
  UNION ALL SELECT '돈카츠 연', 'JAPANESE', 'REGULAR', 2, '삼성역 근처', '등심카츠 정식', TRUE
  UNION ALL SELECT '트라토리아 모모', 'WESTERN', 'WISHLIST', 3, '신논현역 5번 출구', '트러플 파스타', FALSE
  UNION ALL SELECT '버거 스튜디오', 'WESTERN', 'REGULAR', 2, '회사 1층', '수제버거, 감자튀김 큼', FALSE
  UNION ALL SELECT '떡볶이 할머니집', 'SNACK', 'REGULAR', 1, '학동사거리', '튀김 포함 7천원', FALSE
  UNION ALL SELECT '쌀국수 포메인', 'ETC', 'WISHLIST', NULL, '역삼 이면도로', '베트남 음식, 가격 확인 필요', FALSE
) AS s
WHERE NOT EXISTS (SELECT 1 FROM restaurants);

INSERT INTO visits (restaurant_id, visited_on, source, note)
SELECT r.id, DATE_SUB(CURDATE(), INTERVAL v.d DAY), v.src, v.note
FROM (
  SELECT '을지로 칼국수' AS name, 2 AS d, 'RECOMMENDATION' AS src, '비 오는 날' AS note
  UNION ALL SELECT '역삼 순대국', 5, 'MANUAL', NULL
  UNION ALL SELECT '홍콩반점 본점', 9, 'RECOMMENDATION', '팀 점심'
  UNION ALL SELECT '돈카츠 연', 14, 'MANUAL', NULL
  UNION ALL SELECT '떡볶이 할머니집', 20, 'MANUAL', '간단히'
  UNION ALL SELECT '을지로 칼국수', 30, 'MANUAL', NULL
) AS v
JOIN restaurants r ON r.name = v.name
WHERE NOT EXISTS (SELECT 1 FROM visits);
