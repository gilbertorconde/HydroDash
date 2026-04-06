-- HydroDash notifications (MariaDB / MySQL 8+)
-- Reference / manual init only. Runtime schema is applied by the app (see src/server/notifications/schema.ts).

CREATE TABLE IF NOT EXISTS notification_settings (
  id INT PRIMARY KEY,
  settings_json JSON NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT INTO notification_settings (id, settings_json)
VALUES (
  1,
  JSON_OBJECT(
    'defaultTopic', 'hydrodash',
    'topicsByService', JSON_OBJECT(),
    'topicsBySiteId', JSON_OBJECT(),
    'enabledServices', JSON_OBJECT()
  )
)
ON DUPLICATE KEY UPDATE id = id;

CREATE TABLE IF NOT EXISTS notification_events (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  site_id VARCHAR(64) NULL,
  service_key VARCHAR(64) NOT NULL,
  title VARCHAR(512) NOT NULL,
  body TEXT NOT NULL,
  route VARCHAR(255) NOT NULL DEFAULT '/',
  read_at TIMESTAMP NULL DEFAULT NULL,
  ntfy_ok TINYINT(1) NOT NULL DEFAULT 0,
  payload_json JSON NULL,
  INDEX idx_events_inbox (read_at, created_at DESC),
  INDEX idx_events_created (created_at)
);

CREATE TABLE IF NOT EXISTS notification_poller_state (
  site_id VARCHAR(64) NOT NULL PRIMARY KEY,
  snapshot_json LONGTEXT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
