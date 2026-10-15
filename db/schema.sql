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
  skip_dismissed_at DATETIME NULL,
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

-- v0.5 (M5): 기존 DB용 컬럼 추가 (신규 설치에서는 위 CREATE TABLE에 이미 포함되어 무동작)
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

-- v0.6 (M6): 공공데이터 카탈로그. restaurants.place_no 는 places.place_no 의 논리적 참조(FK 없음)

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

-- v1.0: 로그인. 계정은 CLI(app.scripts.manage_users)로만 만든다. 식당 데이터는 모든 계정이 공유한다(owner 컬럼 없음).
CREATE TABLE IF NOT EXISTS users (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  username      VARCHAR(50) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- token_hash = SHA-256(세션 토큰) 의 hex. 원본 토큰은 쿠키에만 있고 DB에는 저장하지 않는다.
CREATE TABLE IF NOT EXISTS sessions (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  token_hash CHAR(64) NOT NULL,
  user_id    BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sessions_token_hash (token_hash),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE CASCADE,
  KEY idx_sessions_user (user_id),
  KEY idx_sessions_expires_at (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
