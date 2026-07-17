-- 解析パイプラインのステップログ（JSON）を保持するカラム
ALTER TABLE inspections ADD COLUMN progress TEXT;
-- API トークン機能の完全削除に伴いテーブルを破棄
DROP TABLE IF EXISTS api_tokens;
