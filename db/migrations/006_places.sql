-- M6 (PRD v0.6) 추가형 마이그레이션: 기존 DB용. 재실행 안전, 데이터 삭제 없음.
-- 적용: sudo mariadb dinner_service < db/migrations/006_places.sql   (DDL이므로 root로 적용)
-- restaurants.place_no 는 FK 없는 논리적 참조(PRD 5.11.1). 등록 여부 EXISTS 조회용 인덱스만 둔다.
SET NAMES utf8mb4;

ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS place_no VARCHAR(30) NULL;
ALTER TABLE restaurants ADD INDEX IF NOT EXISTS idx_restaurants_place_no (place_no);

CREATE TABLE IF NOT EXISTS places (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  place_no       VARCHAR(30) NOT NULL,
  name           VARCHAR(100) NOT NULL,
  branch_name    VARCHAR(100) NULL,
  industry_mid   VARCHAR(50) NOT NULL,
  industry_small VARCHAR(80) NULL,
  category       ENUM('KOREAN','CHINESE','JAPANESE','WESTERN','SNACK','ETC') NOT NULL,
  sido           VARCHAR(30) NOT NULL,
  sigungu        VARCHAR(30) NOT NULL,
  dong           VARCHAR(30) NULL,
  road_address   VARCHAR(255) NULL,
  jibun_address  VARCHAR(255) NULL,
  lon            DECIMAL(10,7) NULL,
  lat            DECIMAL(10,7) NULL,
  imported_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_places_place_no (place_no),
  KEY idx_places_name (name),
  KEY idx_places_region (sido, sigungu, dong)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
