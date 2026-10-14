-- M5 (PRD v0.5) 추가형 마이그레이션: 기존 DB용. 재실행 안전, 데이터 삭제 없음.
-- 적용: sudo mariadb dinner_service < db/migrations/005_m5.sql   (DDL이므로 root로 적용)
SET NAMES utf8mb4;

ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS skip_dismissed_at DATETIME NULL;

CREATE TABLE IF NOT EXISTS recommendation_skips (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  restaurant_id BIGINT UNSIGNED NOT NULL,
  skipped_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_skips_restaurant FOREIGN KEY (restaurant_id)
    REFERENCES restaurants (id) ON DELETE CASCADE,
  KEY idx_skips_restaurant_time (restaurant_id, skipped_at),
  KEY idx_skips_time (skipped_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
