# Ouroboros — 機能 TODO リスト

ソース全体を調査したうえで「あったら嬉しい」機能を優先度別に整理したリストです。
UI 要素の細かな TODO は [`UI-TODO-LIST.md`](./UI-TODO-LIST.md) を参照してください。
本ファイルはエンジン・バックエンド・運用面の機能拡張に焦点を当てています。

凡例: 🔴 高優先度 / 🟡 中優先度 / 🟢 低優先度（あると便利）

---

## 1. データ永続化 / バックエンド

現状 `web/` の設定・Webhook・検査履歴はすべて Nitro のインメモリストレージ（`nuxt.config.ts`）に保持され、
サーバー再起動で消失します。`src/types/inspection.types.ts` に `InspectionRecord` 型は定義済みですが、保存処理が存在しません。

- 🔴 **永続ストレージの導入** — SQLite / PostgreSQL などへ検査履歴・Webhook・設定を保存（`nuxt.config.ts` で `driver: 'memory'` のまま、再起動で消失）
- 🟡 **検査結果のプリプロセッサキャッシュ実装** — コンテンツハッシュは算出済みだが利用されていない（`src/engine/preprocessor.ts:30`）
- 🟢 **検査履歴の CSV / JSON エクスポート**

---

## 2. 認証・セキュリティ

- 🔴 **認証 / セッション管理** — 現状ユーザーはハードコード（`web/layouts/default.vue:118`）、保護なしで API キーを扱う
- 🔴 **Webhook 宛先 URL の検証 (SSRF 対策)** — 任意 URL に POST 可能。localhost / 内部 IP をブロックすべき（`src/webhook/webhook.manager.ts`）
- 🟡 **API キーの暗号化保存** — LLM / Git トークンが平文で扱われる
- 🟡 **API キー管理 UI の実装** — 生成 / ローテーション / 失効ボタンが未配線（`web/pages/settings.vue`）
- 🟢 **監査ログ** — 誰がいつ設定変更・PR マージしたかの記録

---

## 3. 検査エンジン (`src/engine`)

- 🔴 **実 LLM 連携への切り替え** — Web の検査はヒューリスティック（正規表現）モックのまま（`web/server/api/inspect.post.ts`）。`src/engine/inspection.engine.ts` の実エンジンと接続する
- 🟡 **AI レスポンスのスキーマ検証** — `submit_inspection` ツールの出力を盲信している（`src/engine/inspection.engine.ts:322`）。`ajv` は導入済みだがランタイム未使用
- 🟡 **リクエストのスキーマ検証** — AI 呼び出し前に `InspectionRequest` を検証する
- 🟡 **Claude API のタイムアウト / レート制限ハンドリング** — リトライは固定 1000ms バックオフのみ（`inspection.engine.ts:305`）
- 🟡 **プロンプトキャッシュの活用** — analyzer / fixer で繰り返し呼び出されるがキャッシュ未使用（トークン浪費）
- 🟢 **i18n 対応** — システムプロンプト・出力が日本語固定（`src/engine/prompt.builder.ts`）。英語など多言語に対応
- 🟢 **モデルバージョンの設定化** — モデル名がハードコード（`src/config/inspection.config.ts:39`）
- 🟢 **AbortSignal による検査キャンセル対応**

---

## 4. スキャナー (`.self-healing/scanners`)

- 🔴 **ライセンスコンプライアンスチェッカー** — `licenseCheckEnabled` フラグはあるがスキャナー未実装（`config/healing.config.ts:99`）
- 🟡 **スキャナーツールの存在確認** — `trufflehog` / `gitleaks` 未インストール時に空の catch で握り潰す（`secret.scanner.ts`）。事前チェックとログを追加
- 🟡 **空 catch でのエラーログ追加** — 多くのスキャナーが失敗を無音で `[]` 返却（`codeql.scanner.ts:16`, `performance.scanner.ts:70` ほか）
- 🟢 **Lighthouse 閾値の設定化** — メトリクス閾値がハードコード（`performance.scanner.ts:38-45`）
- 🟢 **フレームワークのバージョン認識** — Rails 5 と 7 等で修正戦略を変える
- 🟢 **エコシステム横断の重複検出** — 同一脆弱性の二重報告を排除

---

## 5. AI 分析・修正 (`.self-healing/analyzers`, `fixers`)

- 🟡 **フォールバック分析の網羅性** — Claude 失敗時のフォールバックが critical な依存脆弱性と CodeQL error のみを対象（`ai.analyzer.ts`）
- 🟡 **検証タイムアウトの設定化** — 固定 120 秒、大規模ビルドで不足（`ai.fixer.ts:235`）
- 🟡 **コード抽出の堅牢化** — `<fixed_file>` タグ未検出時に無音で null（`ai.fixer.ts:176,324`）
- 🟢 **大ファイル送信の最適化** — ファイル全文を送信しトークンを浪費（`ai.fixer.ts:212`）
- 🟢 **危険パターン検出** — 修正パッチ内の `shell=True` / SQL インジェクション等を検知（`pr.reviewer.ts`）
- 🟢 **レビューコメントの実投稿** — `ReviewResult` にコメント配列はあるが PR に投稿されない（`pr.reviewer.ts:7,17`）

---

## 6. PR / Issue ワークフロー (`.self-healing/pr`, `utils`)

- 🟡 **設定検証** — repo owner / name 等が未設定でも空文字で黙って続行（`config/healing.config.ts`）
- 🟡 **FixCache のキャッシュ方式見直し** — クローズ済み Issue をキャッシュとして乱造、有効期限なし、ハッシュ 16 文字で衝突リスク（`utils/fix.cache.ts`）
- 🟢 **重複検出の精度向上** — slug の部分一致で誤検出の可能性（`pr.deduplicator.ts:38`）
- 🟢 **CI 待機の指数バックオフ** — 現状 30 秒固定ポーリング（`ci.waiter.ts`）
- 🟢 **ロールバック対象ファイルのログ出力**（`utils/rollback.ts`）

---

## 7. 通知 (`.self-healing/notifications`, `src/webhook`)

- 🟡 **通知失敗時のリトライ** — Slack / Teams 送信失敗を空 catch で握り潰す（`notifier.ts:64-65,83`）
- 🟡 **`inspection.failed` のコンテキスト保持** — 言語が `typescript`、grade が `F` 固定（`src/webhook/webhook.manager.ts:85-86`）
- 🟢 **Slack Block Kit / Teams Adaptive Cards 化** — `notifier.ts` はプレーンテキスト、Teams は非推奨 MessageCard
- 🟢 **メール / その他チャネル対応**
- 🟢 **通知のレート制限** — 大量検出時のスパム防止
- 🟢 **Webhook テスト送信ボタンの実装** — スタブのみ存在（`web/server/api/webhooks/[id]/test.post.ts`）

---

## 8. 可観測性・運用

- 🔴 **メトリクス / 監査ログ** — 修復ループの実行記録が一切残らない（`orchestrator.ts`）。実行回数・成功率・PR 数を蓄積
- 🟡 **構造化ロギング** — `console.warn/error` 直書き。レベル付きロガーへ
- 🟡 **スキャンループ全体のリトライ機構**（`orchestrator.ts`）
- 🟢 **スコアトレンドの予測 / 予報**
- 🟢 **実 GitHub PR データとの連携** — ダッシュボードの PR 履歴は全てモック（`web/composables/useDashboard.ts`）

---

## 9. 開発・CI 整備

- 🟡 **ESLint / lint スクリプトの追加** — `src/package.json` に lint なし（型チェックのみ）
- 🟡 **スキーマ検証の CI 統合と全フィクスチャ対応** — 現在 1 フィクスチャのみ検証（`src/utils/validate-schemas.ts:51`）
- 🟢 **`src/` のビルド成果物定義** — web / .self-healing からの利用方法が不明瞭（build スクリプトなし）
- 🟢 **未使用コードの整理** — `.self-healing/config/severity.ts` はどこからも参照されていない

---

## 10. 新機能アイデア（あると嬉しい）

- 🟢 **修復前後のベンチマーク比較レポート** — パフォーマンス改善を定量表示
- 🟢 **修復ループのスケジュール UI からの実行トリガー** — 現状 cron 固定表示（`index.vue:146`）
- 🟢 **PR レビュー承認ワークフローのカスタマイズ** — priority 別に自動マージ可否を設定
- 🟢 **複数リポジトリ対応** — 1 ダッシュボードから複数 repo を管理
- 🟢 **検査結果の差分通知** — 前回比でスコアが下がった項目のみ通知
- 🟢 **コスト追跡** — LLM API のトークン使用量・課金額の可視化
