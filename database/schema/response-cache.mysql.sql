CREATE TABLE IF NOT EXISTS response_cache (
  cache_key CHAR(64) NOT NULL,
  response_text MEDIUMTEXT NOT NULL,
  created_at BIGINT UNSIGNED NOT NULL,
  expires_at BIGINT UNSIGNED NOT NULL DEFAULT 0,
  hit_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (cache_key),
  KEY idx_response_cache_expiry (expires_at),
  KEY idx_response_cache_hits (hit_count)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Expired entries use expires_at > 0; zero means no expiry.
-- Run periodically from the scheduler:
-- DELETE FROM response_cache WHERE expires_at > 0 AND expires_at <= UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000;
