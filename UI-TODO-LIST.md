# Ouroboros — UI TODO List

現在実装済みのUI要素と、今後追加すべき要素の完全なリストです。

---

## 1. 共通レイアウト (`web/layouts/default.vue`)

### 実装済み
- [x] スティッキーヘッダー（ページスクロールで固定）
- [x] ロゴ + アプリ名 "Ouroboros" 表示
- [x] サブタイトル "Self-Healing System"
- [x] ナビゲーションタブ × 3（Self-Healing `/` / Inspection `/inspection` / Webhooks `/webhooks`）
- [x] アクティブタブのインジゴハイライト（border-bottom + テキスト色変更）
- [x] ヘッダー右端のスロット（追加コンテンツ用、現在未使用）
- [x] ダーク / ライトモード切り替えボタン（ヘッダー右端、sun/moon アイコン、`useColorMode` 連携）

### 追加すべき
- [ ] **グローバル通知エリア** — インスペクション完了・エラー・Webhook送信結果をトースト表示
- [ ] **接続状態インジケーター** — バックエンドAPIへの疎通状態（Online / Offline バッジ）
- [ ] **ユーザーアカウントメニュー** — 将来的な認証導入に備えたアバター + ドロップダウン
- [ ] **グローバル検索** — 指摘事項・PR履歴・依存関係をまたいだ横断検索
- [ ] **バージョン表示** — ヘッダー右端にアプリバージョン（例: `v0.1.0`）
- [ ] **モバイル用ハンバーガーメニュー** — sm未満でタブをドロワーに収納

---

## 2. Self-Healing ページ (`web/pages/index.vue`)

### 左パネル — 設定サイドバー

#### 実装済み
- [x] セクションナビゲーションピル × 4（Git / Languages / LLM API Tokens / AI Model）
- [x] アクティブセクションのハイライト（インジゴ背景 + ボーダー）
- [x] ヘッダー右端に現在の Git サービス名バッジ

##### Git Configuration（`FormGitConfig.vue`）
- [x] Git サービス選択（`USelect`: GitHub / GitLab）
- [x] リポジトリ入力（`owner/repo` 形式プレースホルダー）
- [x] Git アクセストークン入力（パスワード型、表示/非表示トグルボタン付き）

##### Languages（`FormLanguageSelector.vue`）
- [x] 言語チェックリスト（TypeScript / JavaScript / Python / Go / Rust / Java / C# / C++ / Ruby / PHP / Swift / Kotlin）
- [x] "自動検出" ボタン（疑似的に TypeScript / JavaScript / Python / Go を選択、900ms スピナー）

##### LLM API Tokens（`FormApiTokens.vue`）
- [x] Anthropic トークン入力
- [x] OpenAI トークン入力
- [x] Google Gemini トークン入力
- [x] OpenRouter トークン入力
- [x] 各フィールドにプロバイダーロゴアイコン

##### AI Model（`FormModelSelector.vue`）
- [x] AI サービス選択（入力済みトークンに応じて動的フィルタリング）
- [x] モデル選択（サービスごとのモデル一覧: Anthropic / OpenAI / Gemini / OpenRouter）
- [x] サービス変更時にモデル選択をリセット

##### Setup Status（クイックサマリーパネル）
- [x] Repository 設定値 or "Not set"
- [x] Git Token マスク表示（設定済みなら `●●●●●●`）
- [x] Languages 選択数
- [x] AI Model 設定値 or "Not set"

#### 追加すべき（左パネル）
- [ ] **設定のバリデーション表示** — 必須フィールド未入力時にエラーメッセージ
- [ ] **設定の永続化** — LocalStorage または API へのセーブ / ロード
- [ ] **設定プロファイル管理** — 複数プロジェクト設定の保存・切り替え
- [ ] **接続テストボタン** — Git トークンの有効性を API に問い合わせて確認
- [ ] **リポジトリ候補サジェスト** — Git トークンを使って組織リポジトリを自動補完
- [ ] **スキャンスケジュール設定** — cron式またはUI選択で定期スキャンを設定
- [ ] **スコア閾値グローバル設定** — 全体アラートの閾値スライダー（現在はWebhookページのみ）
- [ ] **GitLab 固有フィールド** — GitLab 選択時に表示する Instance URL フィールド

### 右パネル — ダッシュボード

#### 実装済み

##### Service Metrics（`DashboardMetricsCards.vue`）
- [x] 4 指標カード（2×2 グリッド）:
  - Total Fixes Applied（インジゴ、wrench アイコン、+12 デルタバッジ）
  - PRs Created（ブルー、+5 デルタバッジ）
  - PRs Merged（エメラルド、+4 デルタバッジ）
  - Risk Score（アンバー、-8 デルタバッジ、`/100` サフィックス）
- [x] デルタバッジのプラス/マイナスに応じた色分け（緑 / 赤）
- [x] グラデーション背景 + ボーダー（カラーマップ対応）

##### Code Statistics（`DashboardCodeStats.vue`）
- [x] 統計グリッド（2×3）: Lines Added / Lines Removed / Files Changed / Commits / Lines Scanned
- [x] 各値のカラーコード（緑 / 赤 / 青 / 紫 / グレー）
- [x] Code churn バー（Additions% / Deletions% の相対プログレスバー）
- [x] Net 増減行数表示（色付きテキスト）

##### Fix Cause Analysis（`DashboardCausePieChart.vue`）
- [x] Doughnut チャート（Chart.js）: Security 67% / Performance 33%
- [x] チャート中央に Security% を大きく表示
- [x] 凡例（bottom、point style）
- [x] 数値ブロック × 2（Security / Performance の色付きカード）

##### Dependency Updates（`DashboardDependencyChanges.vue`）
- [x] 依存関係カード一覧（バージョン before → after 表示）
- [x] パッケージ名（モノスペース）
- [x] Severity バッジ（Critical / High / Medium / Low / Info）
- [x] Type ラベル（major 赤 / minor アンバー / patch 緑）
- [x] バージョン pill（赤 → 緑の矢印表示）

##### Pull Request History（`DashboardPrHistory.vue`）
- [x] テーブル: # / Title（ブランチ名サブテキスト） / Cause / Date / Status
- [x] Cause バッジ（Security 赤 / Perf 青 / Dep アンバー）、sm以上で表示
- [x] Date カラム、md以上で表示
- [x] Status バッジ（merged 紫 / open 緑 / closed 赤）
- [x] 行ホバーで背景ハイライト

#### 追加すべき（右パネル）
- [ ] **全データの実API接続** — 現在すべてのダッシュボードデータはハードコードされたスタブ
- [ ] **日付レンジフィルター** — 期間選択（7日 / 30日 / 90日 / カスタム）
- [ ] **PR 詳細ドロワー** — テーブル行クリックで PR 差分・スコアをサイドドロワーに表示
- [ ] **メトリクスの時系列グラフ** — Fixes / PRs / Risk Score の推移折れ線グラフ
- [ ] **Cause Analysis の軸追加** — Maintainability / Design / Modernization も分析対象に
- [ ] **依存関係フィルター** — Severity / Type でフィルタリング
- [ ] **CVE リンク** — 依存関係カードから関連 CVE / Advisory ページへのリンク
- [ ] **PR テーブルページネーション** — 現在 7 件固定、無限スクロールまたはページ切替
- [ ] **リアルタイム更新** — Server-Sent Events または WebSocket でダッシュボードを自動リフレッシュ
- [ ] **エクスポート機能** — CSV / JSON でメトリクス・PR 履歴をダウンロード
- [ ] **"Last scan" の実データ反映** — 現在 `new Date().toLocaleDateString('ja-JP')` のハードコード

---

## 3. Inspection ページ (`web/pages/inspection.vue`)

### 左パネル — 入力フォーム

#### 実装済み
- [x] "サンプルを使う" クイックロードボタン（TypeScript / Python サンプルコード）
- [x] 言語ピルボタン × 10（typescript / javascript / python / go / rust / java / csharp / cpp / ruby / flutter）
- [x] プロジェクトコンテキストテキストエリア（2行、任意）
- [x] ファイルパス入力（モノスペースインライン input）
- [x] コードテキストエリア（14行、モノスペース、フォーカスボーダー）
- [x] ファイル削除ボタン（× アイコン、ファイルが2件以上の場合のみ表示）
- [x] "ファイルを追加" ボタン（最大数制限なし）
- [x] エラーメッセージ表示（赤背景 + ボーダー）
- [x] "インスペクション実行" ボタン（インジゴ、ローディングスピナー）

#### 追加すべき（左パネル）
- [ ] **ファイルアップロード** — ドラッグ&ドロップ / ファイル選択ダイアログ
- [ ] **Git リポジトリから自動取得** — 設定済みリポジトリのファイルツリーを表示して選択
- [ ] **ファイル数上限警告** — 一度に送信できるファイル数の上限（例: 20件）と警告
- [ ] **合計コードサイズ表示** — 全ファイルの合計文字数 / 行数
- [ ] **言語の絞り込み検索** — 言語が多い場合の検索フィルタ
- [ ] **コードエディタ** — Monaco Editor / CodeMirror の統合（シンタックスハイライト、行番号）
- [ ] **ファイルツリービュー** — 複数ファイルをツリー形式で管理
- [ ] **インスペクション設定** — 閾値・重み付けのページ単位上書き

### 右パネル — 結果表示

#### 実装済み

##### Score Trend Chart（`InspectionScoreTrendChart.vue`）
- [x] 折れ線グラフ（Chart.js）: Overall / Performance / Design の3系統
- [x] Overall はエリア塗り（rgba）、Performance / Design は破線
- [x] ダークテーマ（背景色 / グリッド / 軸ラベル）
- [x] 常時表示（結果なしでも表示）

##### ローディング状態
- [x] スピナー（インジゴ border-t-transparent アニメーション）
- [x] "AIがコードを解析中です..." テキスト

##### 空状態
- [x] 虫眼鏡アイコン
- [x] "コードを入力してインスペクションを実行してください" テキスト

##### Score Overview（`InspectionScoreGauge.vue` + `InspectionScoreBreakdown.vue`）
- [x] SVG アーク型ゲージ（下部 60° ギャップ、グレードカラー対応）
- [x] グレードバッジ（S/A/B/C/D/F）+ スコア数値の中央表示
- [x] アニメーション遷移（dasharray/dashoffset 変化）
- [x] 5次元スコアバーリスト: 設計 / パフォーマンス / モダン化 / 保守性 / 正確性
- [x] 各次元に: アイコン / ラベル / ウェイト% / スコア数値 / 進捗バー / サマリーテキスト
- [x] バーの色コード（緑 / アンバー / 赤）
- [x] 結果サマリー（カード下部、ボーダー区切り）
- [x] 言語ラベル + 実行時間（ms）表示

##### Findings List（`InspectionFindingsList.vue`）
- [x] 重要度フィルターピル（critical / high / medium / low、全件数バッジ）
- [x] カテゴリフィルターピル（動的生成）
- [x] 指摘件数バッジ（赤）
- [x] 各指摘の展開/折り畳み（クリックで吐露）
- [x] 重要度アイコン + ラベル
- [x] カテゴリバッジ
- [x] 指摘タイトル
- [x] ファイルパス + 行番号（モノスペース）
- [x] コードスニペット（`<pre>` タグ、モノスペース）
- [x] インパクト説明（アンバー背景ボックス）
- [x] "改善案を見る" ボタン（`select` イベント emit）

##### Diff Viewer（`InspectionDiffViewer.vue`）
- [x] 選択指摘がない場合の空状態（カーソルアイコン + テキスト）
- [x] タブ切替: 分割表示 / Diff 表示
- [x] 分割表示: before（赤背景） / after（緑背景）の2カラム、スクロール同期なし
- [x] Diff 表示: `+`（緑）/ `-`（赤）/ `@@`（インジゴ）の行ごと色分け
- [x] ファイルパス表示
- [x] Rationale（根拠）ボックス
- [x] Impact（影響）ボックス

#### 追加すべき（右パネル）
- [ ] **スコア推移チャートの実データ接続** — 現在 `/api/history` のメモリ内データのみ、グラフが常に空に近い
- [ ] **インスペクション履歴ページ / リスト** — 過去の実行結果を一覧・再表示
- [ ] **結果の共有 / エクスポート** — JSON / PDF / Markdown 形式でダウンロード
- [ ] **ファイル別スコアドリルダウン** — ファイルが複数ある場合のファイル単位スコア
- [ ] **指摘事項の絞り込み検索テキストボックス**
- [ ] **"全て展開 / 全て折り畳み" ボタン** — FindingsList の一括操作
- [ ] **指摘の無視 / 却下機能** — 指摘を「既知の問題」として非表示
- [ ] **Diff のコードコピーボタン** — after コードをクリップボードにコピー
- [ ] **スクロール同期 Diff** — 分割表示で before/after を連動スクロール
- [ ] **改善案のバッチ適用** — 複数推奨事項をまとめて適用したコードをダウンロード
- [ ] **比較機能** — 2つのインスペクション結果を横並びで比較
- [ ] **推奨事項一覧パネル** — Diff Viewer とは別にすべての推奨を一覧表示
- [ ] **スコアカードの印刷レイアウト** — `@media print` 対応

---

## 4. Webhooks ページ (`web/pages/webhooks.vue`)

### 実装済み

#### ページヘッダー
- [x] タイトル "Webhook設定"
- [x] サブタイトル（日本語: インスペクション結果を Slack・Discord・GitHub などへ自動通知）
- [x] "エンドポイントを追加" / "キャンセル" トグルボタン（インジゴ）

#### アダプターガイドカード × 4
- [x] Slack（pink アイコン、Block Kit形式）
- [x] Discord（indigo アイコン、Embed形式）
- [x] GitHub（gray アイコン、PRコメント形式）
- [x] Generic（blue アイコン、JSON Payload）

#### エンドポイント追加フォーム（`WebhookWebhookEndpointForm.vue`）
- [x] Name 入力
- [x] URL 入力
- [x] Adapter 選択（`USelect`: slack / discord / github / generic）
- [x] イベントトグルボタン × 3（inspection.completed / inspection.threshold_breached / inspection.failed）
- [x] スコア閾値スライダー（threshold_breached 選択時のみ表示、0〜100）
- [x] Secret 入力（HMAC署名用）
- [x] 保存 / キャンセルボタン
- [x] POST `/api/webhooks` へ送信

#### 設定済みエンドポイント一覧（`WebhookWebhookEndpointList.vue`）
- [x] 件数バッジ
- [x] 各エンドポイントカード:
  - アダプターアイコン（Slack / Discord / GitHub / Generic）
  - 名前 + URL（モノスペース、文字切れ対応）
  - 登録済みイベントバッジ
  - スコア閾値バッジ（threshold_breached 設定時のみ）
  - "テスト" ボタン（POST `/api/webhooks/[id]/test`、HTTP ステータス + 成功/失敗インライン表示、4秒後自動クリア）
  - "削除" ボタン（DELETE `/api/webhooks/[id]`、"delete" 入力検証付き確認ダイアログ）

#### イベントリファレンス
- [x] `inspection.completed`（emerald バッジ + 説明）
- [x] `inspection.threshold_breached`（amber バッジ + 説明）
- [x] `inspection.failed`（red バッジ + 説明）

### 追加すべき
- [ ] **エンドポイント編集** — 作成後の名前・URL・設定変更機能（編集ボタンは存在するが機能未配線）
- [ ] **有効/無効トグル** — エンドポイントを削除せずに無効化
- [ ] **Webhook 配信ログ** — 過去の配信履歴（成功/失敗、HTTP ステータス、タイムスタンプ）
- [ ] **再送ボタン** — 失敗した Webhook を手動で再送
- [ ] **カスタムヘッダー UI** — 現在はフォームに Custom Headers の入力欄がない
- [ ] **次元別閾値スライダー** — Overall だけでなく各次元（design/performance 等）の閾値設定
- [ ] **Webhook プレビュー** — 送信される JSON ペイロードのプレビュー表示
- [ ] **テスト結果詳細** — レスポンスボディを展開表示
- [ ] **エンドポイントの並べ替え** — ドラッグ&ドロップで優先順位変更

---

## 5. インスペクション結果 詳細ページ（一部実装済み）

### 実装済み
- [x] `/inspection/[id]` ルート — `web/pages/inspection/[id].vue` として実装済み
- [x] スコアカード全体表示（現在はスタブデータ）
- [x] 全指摘事項 + 推奨事項のリスト（現在はスタブデータ）

### 追加すべき
- [ ] **実データ接続** — `GET /api/inspect/[id]` へ接続してスタブを実データに置換（現在はハードコードスタブのみ）
- [ ] **前回との比較 (diff)**
- [ ] **"再インスペクション" ボタン**
- [ ] **結果の PDF / Markdown エクスポート**

---

## 6. 設定ページ（一部実装済み）

### 実装済み
- [x] `/settings` ルート — `web/pages/settings.vue` として実装済み
- [x] デフォルトスコアウェイト変更 UI（スライダー、`PUT /api/settings` へ保存）
- [x] グレード閾値変更 UI（S/A/B/C/D/F の境界値、`PUT /api/settings` へ保存）
- [x] スキャンスケジュール管理（cron / interval / manual モード切替）
- [x] 通知設定（ブラウザプッシュなどのトグル、`PUT /api/settings` へ保存）
- [x] API キー一覧表示と生成ボタン UI

### 追加すべき
- [ ] **設定の永続化** — `nitro.storage` が `driver: 'memory'` のためサーバー再起動で消失（SQLite 等への切替が必要）
- [ ] **API キーのローテーション・取り消し** — 一覧は表示されるが操作ボタンが未配線

---

## 7. アクセシビリティ・UX 全般（横断）

### 追加すべき
- [ ] **キーボードナビゲーション** — タブ移動、Enter/Space でのボタン操作
- [ ] **スクリーンリーダー対応** — `aria-label`、`role`、`aria-live` 属性の付与
- [ ] **フォームバリデーション** — URL 形式チェック、必須フィールドのリアルタイム検証
- [ ] **ローディングスケルトン** — データフェッチ中の骨格 UI（現在はスピナーのみ）
- [ ] **エラーページ** — 404 / 500 のカスタムエラーページ
- [ ] **モバイルレスポンシブ** — sm未満でサイドバーがオーバーレイドロワーに切替
- [ ] **コンテナ幅のレスポンシブ微調整** — 現在 `max-w-screen-2xl` 固定
- [ ] **フォーカストラップ** — モーダル / ドロワーでフォーカスが外に漏れないように
- [ ] **トースト通知システム** — 操作成功・失敗のフィードバック（現在はインラインのみ）
- [ ] **確認モーダル** — 削除などの破壊的操作の確認ダイアログ
- [ ] **ページタイトルの動的更新** — ページ遷移時に `<title>` を更新
- [ ] **国際化 (i18n)** — 現在は日本語と英語が混在、統一または多言語対応

---

## 8. バックエンド API（UI と連携して追加すべき）

| エンドポイント | 説明 | 現状 |
|---|---|---|
| `GET /api/history` | スコア履歴一覧 | 実装済み（メモリ内） |
| `POST /api/inspect` | インスペクション実行 | 実装済み（ヒューリスティック疑似エンジン） |
| `GET /api/webhooks` | Webhook 一覧 | 実装済み |
| `POST /api/webhooks` | Webhook 作成 | 実装済み |
| `DELETE /api/webhooks/[id]` | Webhook 削除 | 実装済み |
| `POST /api/webhooks/[id]/test` | Webhook テスト送信 | 実装済み |
| `GET /api/inspect/[id]` | 特定のインスペクション結果取得 | 実装済み（メモリ内、UI は未接続） |
| `GET /api/metrics` | ダッシュボードメトリクス（実データ） | 実装済み（メモリ内） |
| `GET /api/webhooks/[id]/logs` | Webhook 配信ログ | **未実装** |
| `PATCH /api/webhooks/[id]` | Webhook 更新 | 実装済み |
| `GET /api/config` | 設定の読み込み | 実装済み（メモリ内） |
| `PUT /api/config` | 設定の保存 | 実装済み（メモリ内） |
| `GET /api/settings` | スコア重み・閾値・スケジュール読み込み | 実装済み（メモリ内） |
| `PUT /api/settings` | スコア重み・閾値・スケジュール保存 | 実装済み（メモリ内） |

---

*最終更新: 2026-05-23（実装済み項目を反映）*
