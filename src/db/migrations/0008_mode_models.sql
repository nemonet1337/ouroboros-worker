-- Migration number: 0008
-- モード別 AI モデル設定（JSON: {"coding","plan","refactor","healing","inspection"}）
ALTER TABLE users ADD COLUMN mode_models TEXT;
-- Code モードの Plan フェーズ出力を永続化
ALTER TABLE code_sessions ADD COLUMN plan TEXT;
