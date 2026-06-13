-- Create default admin user
INSERT INTO users (id, email, password_hash, role, created_at, updated_at)
VALUES (
  'admin-user-id-00000000000000',
  'admin@ouroboros.local',
  'pbkdf2$120000$pjpxupfjTL3ArOXtyh6f3g==$+f7xgEiP7kMu4J8n6afjmBYmkPy/GNSvUF8IErpTcmA=',
  'admin',
  1718300000000,
  1718300000000
) ON CONFLICT(email) DO NOTHING;

-- Seed default settings
INSERT INTO settings (key, value, updated_at)
VALUES (
  'registration_enabled',
  'false',
  1718300000000
) ON CONFLICT(key) DO NOTHING;
