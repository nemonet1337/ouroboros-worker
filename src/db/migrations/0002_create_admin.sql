-- Registration is open by default so the first visitor can bootstrap the admin
-- account via /register.  The admin's register() call sets role='admin'
-- automatically when no users exist yet.  After the first registration the
-- toggle is locked back to false by the service layer.
INSERT INTO settings (key, value, updated_at)
VALUES (
  'registration_enabled',
  'true',
  1718300000000
) ON CONFLICT(key) DO NOTHING;
