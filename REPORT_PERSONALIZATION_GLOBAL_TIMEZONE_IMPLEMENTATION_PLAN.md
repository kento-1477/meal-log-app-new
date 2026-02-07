# AIレポート個別化 + グローバルタイムゾーン対応 実装計画書

## 0. 目的
- 無機質/無難に寄っているAIレポートを、ユーザーが「自分向け」と感じる体験へ改善する。
- レポート集計の固定タイムゾーン（`Asia/Tokyo`）依存を解消し、海外ユーザーの現地日付で一貫した集計・表示にする。
- 既存契約（既存クライアント・既存レポート履歴）を壊さず段階導入する。

## 1. 現状分析（As-Is）

### 1-1. 実装済み機能
- [x] レポート生成は `AiReportRequest` 非同期ワーカー方式（queued/processing/done/failed/canceled）。
- [x] ユーザー設定として `goal / focusAreas / adviceStyle` を保持。 
- [x] レポート画面で `simple / concrete / motivational` を選択可能。
- [x] 比較指標（comparison）やUI演出（effect, streakDays, weeklyPrompt）は実装済み。

### 1-2. 無機質化の原因（Root Cause）
- [x] プロンプトで「励まし先行」「7:3励まし比率」を固定し、文体の自由度を抑えている。
- [x] 生成後に `normalizeReportTone` で再度ポジティブ補正しており、尖り表現が打ち消される。
- [x] AI入力コンテキストが集計中心で、行動特定に必要な粒度（時間帯癖・食事内容の連続パターン等）が不足。
- [x] 低温度設定（`temperature: 0.2`）で出力が収束しやすい。
- [x] 失敗時の deterministic fallback が定型文のため、体験が均質化する。

### 1-3. 海外ユーザー課題（タイムゾーン）
- [x] `DASHBOARD_TIMEZONE` が `Asia/Tokyo` 固定で、レポート集計基準日が端末現地日とずれる。
- [x] `AiReportRequest.timezone` は保持しているが、ワーカー内の主要集計 `getDashboardSummary` が固定TZを使用。
- [x] レポート画面詳細（dashboard summary再取得）も同様に固定TZ集計で再描画される。
- [x] 同一ユーザーでも「カレンダー（現地TZ）」と「レポート集計（固定TZ）」で境界日が不一致になりうる。

## 2. 改善方針（To-Be）

### 2-1. 個別化方針
- [x] 「事実（集計・評価）」と「語り口（voice）」を分離する。
- [x] 既存 `adviceStyle` は維持しつつ、新規 `voiceMode` を追加してトーンを制御する。
- [x] 初期は3モードで導入する。
  - [x] `gentle`（あまあま）
  - [x] `balanced`（真面目）
  - [x] `sharp`（激尖り）
- [x] `sharp` は「人格否定禁止、行動特定は強く」をガードレール化する。

### 2-2. タイムゾーン方針
- [x] レポート作成時に「リクエストTZ」を必ず確定し、`AiReportRequest.timezone` に保存する。
- [x] ワーカー集計/比較/ストリーク/UI再取得のすべてで、`request.timezone` を優先使用する。
- [x] TZ未指定時のみフォールバック（最終手段）として `DASHBOARD_TIMEZONE` を使う。

### 2-3. 互換性方針
- [x] 既存 `AiReportPreference` 契約は後方互換で拡張（必須化しない）。
- [x] 既存保存済みレポートは読み取り時に現行互換ロジック（例: `streakDays` 旧形式）を維持する。
- [x] 旧クライアントからの `voiceMode` 未送信は `balanced` 扱い。

## 3. スコープ

### 3-1. 対象
- [x] モバイル: `/apps/mobile/app/report.tsx`
- [x] モバイルAPI: `/apps/mobile/src/services/api.ts`
- [x] Edge: `/supabase/functions/meal-log/index.ts`
- [x] Shared schema: `/packages/shared/src/index.ts`
- [x] i18n: `/apps/mobile/src/i18n/index.ts`
- [x] migration: `/supabase/migrations/*`
- [x] analytics: `/apps/mobile/src/analytics/*`

### 3-2. 非対象（今回）
- [x] LLM基盤刷新（モデル変更・RAG導入）は行わない。
- [x] レポート以外のチャット返信トーンには適用しない。

## 4. 実装チェックリスト（詳細ブレイクダウン）

## Phase A: 仕様凍結
- [x] `voiceMode` の正式enum値と表示文言を確定。
- [x] 各モードの禁止表現/許容表現を定義。
- [x] モード別トーン目標を定義（励まし:是正比率、断定度、文長、数値強調）。
- [x] `adviceStyle` と `voiceMode` の責務分離を仕様に明記。
- [x] 海外TZ仕様を明記（IANA timezone, 例: `America/Los_Angeles`）。

**完了条件**
- [x] 仕様1枚で `voiceMode x adviceStyle` の挙動が説明できる。
- [x] タイムゾーン優先順位（request > profile > default）が明文化されている。

## Phase B: データモデル / API契約

### B-1. Shared Schema
- [x] `AiReportVoiceModeSchema` を追加（`gentle|balanced|sharp`）。
- [x] `AiReportPreferenceSchema` に `voiceMode` を optional で追加。
- [x] `AiReportPreferenceInputSchema` を同様に拡張。
- [x] 既存型利用箇所の型エラーを解消。

### B-2. DB Migration
- [x] `UserReportPreference` に `voiceMode` カラム追加（default `balanced`）。
- [x] CHECK制約を追加。
- [x] `AiReportRequest.preferenceSnapshot` の `voiceMode` 保存を許容。

### B-3. API
- [x] `GET /api/reports/preferences` で `voiceMode` を返却。
- [x] `PUT /api/reports/preferences` で `voiceMode` 保存。
- [x] `POST /api/reports` の `preferenceOverride` で `voiceMode` を受理。

**完了条件**
- [x] 旧payload（voiceModeなし）で動作継続。
- [x] 新payload（voiceModeあり）で保存・再取得一致。

## Phase C: Edgeレポート生成（文体個別化）

### C-1. Preference正規化
- [x] `normalizeReportPreference` で `voiceMode` を補完（未指定 -> `balanced`）。
- [x] onboarding由来の初期推定ルールを追加（必要なら `planIntensity` を補助利用）。

### C-2. Prompt設計
- [x] `buildReportPrompt` に `voiceMode` 別の明示ルールを追加。
- [x] `gentle`: 承認語多め、修正提案は柔らかく。
- [x] `balanced`: 現行に近い中立。
- [x] `sharp`: 課題を先頭で断定、優先順位と行動1位を強調。
- [x] `sharp` に安全制約を追加（侮辱/人格否定/脅し禁止）。

### C-3. 後処理の再設計
- [x] `normalizeReportTone` をモード対応に改修。
- [x] 一律励ましprefix付与を廃止し、モード別補正に変更。
- [x] highlightsの「ポジ2:ネガ1」固定ロジックを緩和（mode別）。

### C-4. fallback改善
- [x] `buildReportMock` をモード対応。
- [x] AI失敗時も voiceMode が崩れない定型文へ更新。

**完了条件**
- [x] 同一入力で mode変更時に明確に文体差が出る。
- [x] 事実（score/metrics/comparison）は mode間で不変。

## Phase D: グローバルタイムゾーン対応

### D-1. リクエスト時のTZ確定
- [x] `POST /api/reports` で `resolveRequestTimezone(...)` を使用。
- [x] `resolveReportRange(...)` に timezone引数を渡し、`rangeStart/rangeEnd/timezone` をTZ基準で確定。

### D-2. ワーカー集計
- [x] `getDashboardSummary(...)` を timezone引数対応に変更。
- [x] `processReportRequest` から `request.timezone` を必須で渡す。
- [x] `resolveComparisonRange(...)` と比較側集計も同一timezoneで統一。
- [x] `getUserStreak(...)` に timezone引数を受け、`request.timezone` で計算。

### D-3. 画面詳細再取得との整合
- [x] `GET /api/dashboard/summary` が `X-Timezone` あるいは query timezone を尊重するよう変更。
- [x] レポート画面の詳細カード（trend/macros等）と report本体で日境界が一致することを確認。

### D-4. フォールバック優先順位
- [x] 優先順を実装: request timezone > request header timezone > user profile timezone(将来拡張) > DASHBOARD_TIMEZONE。
- [x] 不正timezone時の正規化/エラー応答を統一。

**完了条件**
- [x] 同一ユーザーが海外TZで利用しても、カレンダー/summary/reportの境界日が一致。
- [x] JST固定起因の前日/翌日ズレが再現しない。

## Phase E: iOS UX実装

### E-1. 設定UI
- [x] レポート設定モーダルに `voiceMode` 選択UIを追加。
- [x] 初回未設定フローで `voiceMode` を必須質問に含める。

### E-2. 画面内即時切替
- [x] レポート上部にモードチップを配置（`gentle/balanced/sharp`）。
- [x] モード変更時の挙動を仕様化。
  - [x] 案1: 再生成必須（クレジット消費あり）
  - [ ] 案2: 同一データで文体のみ再レンダ（消費なし）
- [x] 初回は案1で開始する場合、消費UIを明確表示。

### E-3. 文言/i18n
- [x] 日英で `voiceMode` ラベルと説明文を追加。
- [x] 強い口調モードの注意文を追加（設定画面）。

**完了条件**
- [ ] 3タップ以内でモード変更・再生成まで到達できる。
- [ ] モードの意味が説明なしでも伝わる。

## Phase F: 計測/KPI

### F-1. Analyticsイベント追加
- [x] `report.preference_saved`（goal/focus/adviceStyle/voiceMode）
- [x] `report.generate_requested`（period/range/tz/voiceMode）
- [x] `report.generate_completed`（latency/status/model/fallback）
- [x] `report.voice_mode_switched`
- [x] `report.details_expanded`
- [x] `report.shared`

### F-2. KPIダッシュボード
- [x] モード別 24h再訪率
- [x] モード別 翌日記録継続率
- [x] モード別 共有率
- [x] モード別 再生成率
- [x] 海外TZユーザーの失敗率/ズレ問い合わせ件数

**完了条件**
- [x] モード別に効果差を判定できる最小ダッシュボードがある。

## Phase G: テスト

### G-1. Unit（Edge）
- [x] `normalizeReportPreference` voiceMode補完テスト。
- [x] `buildReportPrompt` mode別ルール反映テスト。
- [x] `normalizeReportTone` mode別補正テスト。
- [x] `resolveReportRange` timezone境界テスト（DST含む）。
- [x] `getDashboardSummary` timezone別集計テスト。

### G-2. Contract
- [x] `streakDays` 旧形式/新形式互換テスト。
- [x] `GET/PUT preferences` 旧クライアント互換テスト。

### G-3. E2E手動再現
- [x] 海外タイムゾーン端末（例: `America/Los_Angeles`）で日付境界を跨ぐケースを再現。
- [x] 同範囲で `gentle/balanced/sharp` を比較し、文体差と事実不変を確認。

**完了条件**
- [x] Hotspot Change Gate必須チェックを満たす。
  - [x] Immediate done response state transition
  - [x] `streakDays` old/new compatibility
  - [x] Cancel flow double-execution conflicts

## Phase H: リリース / ロールバック

### H-1. 段階リリース
- [x] サーバー側に簡易フラグ（env）を導入。
  - [x] `REPORT_VOICE_MODE_ENABLED`
  - [x] `REPORT_REQUEST_TIMEZONE_ENABLED`
- [ ] 内部ユーザー -> 10% -> 50% -> 100% の順で展開。

### H-2. ロールバック手順
- [x] UIのみロールバック: `voiceMode` 選択UI非表示（既存adviceStyleのみ）。
- [x] Edgeのみロールバック: mode別補正を停止し `balanced` 固定。
- [x] DB影響ロールバック: 新カラムは残置しアプリ利用を停止（破壊的down migrationは原則しない）。

### H-3. 監視
- [x] 生成失敗率
- [x] タイムゾーン不整合ログ
- [x] fallback利用率
- [x] クレームキーワード（厳しすぎ/刺さらない/日付ずれ）

**完了条件**
- [ ] 24-72h監視で重大障害なし。

## 5. 実装順（推奨）
- [x] Step 1: Schema + migration + API契約（後方互換）
- [x] Step 2: Edge timezone修正（先に整合性を直す）
- [x] Step 3: Edge voiceMode prompt/補正
- [x] Step 4: Mobile UI + i18n
- [x] Step 5: Analytics + KPI
- [ ] Step 6: テスト/段階リリース

## 6. 受け入れ基準（Definition of Done）
- [x] 同一ユーザー同一期間で、`gentle/balanced/sharp` の文体差が明確。
- [x] score/metrics/comparisonはモード変更で不変。
- [x] 海外タイムゾーンで、カレンダー選択範囲とレポート集計範囲が一致。
- [x] `streakDays` 旧データ互換が維持される。
- [x] Hotspot Change Gateの最小チェック + lint/test が通る。

## 7. 作業PRテンプレート（この計画向け）

### 7-1. Repro（修正前不具合）
- [ ] 手順1:
- [ ] 手順2:
- [ ] 実際結果:
- [ ] 期待結果:

### 7-2. Regression checks
- [x] Immediate done response state transition
- [x] `streakDays` old/new compatibility
- [x] Cancel flow double-execution conflicts

### 7-3. Rollback note
- [x] UI scope
- [x] Edge scope
- [x] DB scope

---

## 8. 補足メモ
- 現状はレポート関連の自動計測イベントが不足しているため、体験改善の検証精度が低い。voiceMode導入と同時に計測実装を着手する。
- タイムゾーン修正はレポート機能だけでなく、レポート画面が参照する `dashboard summary` の一貫性確保が必須。
