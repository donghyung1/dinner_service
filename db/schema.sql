-- 오늘 뭐 먹지? 스키마 (PRD 6장). MariaDB 10.6+, utf8mb4 / utf8mb4_unicode_ci / InnoDB
-- 적용: sudo mariadb dinner_service < db/schema.sql  (재실행 안전)

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS restaurants (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name        VARCHAR(100) NOT NULL,
  category    ENUM('KOREAN','CHINESE','JAPANESE','WESTERN','SNACK','ETC') NOT NULL,
  status      ENUM('REGULAR','WISHLIST') NOT NULL DEFAULT 'WISHLIST',
  price_level TINYINT UNSIGNED NULL,
  location    VARCHAR(255) NULL,
  memo        TEXT NULL,
  is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT chk_restaurants_price_level CHECK (price_level BETWEEN 1 AND 4),
  KEY idx_restaurants_category_status (category, status),
  KEY idx_restaurants_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS visits (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  restaurant_id BIGINT UNSIGNED NOT NULL,
  visited_on    DATE NOT NULL,
  source        ENUM('RECOMMENDATION','MANUAL') NOT NULL DEFAULT 'MANUAL',
  note          VARCHAR(255) NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_visits_restaurant FOREIGN KEY (restaurant_id)
    REFERENCES restaurants (id) ON DELETE CASCADE,
  KEY idx_visits_restaurant_date (restaurant_id, visited_on DESC),
  KEY idx_visits_date (visited_on)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
