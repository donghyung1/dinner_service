-- v1.0 추가형 마이그레이션: 기존 DB용. 재실행 안전, 데이터 삭제 없음.
-- 적용: sudo mariadb dinner_service < db/migrations/007_auth.sql   (DDL이므로 root로 적용)
SET NAMES utf8mb4;

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
