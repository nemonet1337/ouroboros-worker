-- パッチ生成失敗時のエラー理由を保持
ALTER TABLE code_sessions ADD COLUMN error_message TEXT;
-- 生成モード: plan_code（Plan+Code）/ code_only（Code のみ）
ALTER TABLE code_sessions ADD COLUMN mode TEXT NOT NULL DEFAULT 'plan_code';
