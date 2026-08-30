-- Webhook 機能削除。既存 DB の webhooks テーブルと設定キーを破棄する。
DROP TABLE IF EXISTS webhooks;
DELETE FROM settings WHERE key = 'webhooks_enabled';
