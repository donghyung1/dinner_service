-- DB와 최소 권한 계정 생성. 비밀번호는 커밋하지 않고 변수로 주입한다.
-- 사용:
--   (echo "SET @pw='<비밀번호>';"; cat db/init_db.sql) | sudo mariadb

CREATE DATABASE IF NOT EXISTS dinner_service
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET @h1 = CONCAT('CREATE USER IF NOT EXISTS ''dinner_app''@''localhost'' IDENTIFIED BY ''', @pw, '''');
SET @h2 = CONCAT('CREATE USER IF NOT EXISTS ''dinner_app''@''127.0.0.1'' IDENTIFIED BY ''', @pw, '''');
PREPARE s1 FROM @h1; EXECUTE s1; DEALLOCATE PREPARE s1;
PREPARE s2 FROM @h2; EXECUTE s2; DEALLOCATE PREPARE s2;

GRANT SELECT, INSERT, UPDATE, DELETE ON dinner_service.* TO 'dinner_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON dinner_service.* TO 'dinner_app'@'127.0.0.1';
FLUSH PRIVILEGES;
