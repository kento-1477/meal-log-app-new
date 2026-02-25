# AIレポート機能 改訂版 実装チェックリスト

## Phase 1: 仕様凍結（ブレ防止）
- [x] 比較基準を「同期間長・同タイムゾーン」で固定（日次/週次/月次）
- [x] 目的別比較軸を実装側で定義（減量/維持/増量）
- [x] 高低スコア演出の閾値を実装（高>=85 / 低<=45）
- [x] 記録不足判定を period 別閾値で実装（日1/週4/月7）

## Phase 2: データモデル/API契約
- [x] `UserReportPreference` テーブル追加（goal/focusAreas/adviceStyle）
- [x] `AiReportRequest` に `preferenceSnapshot` を追加
- [x] shared schema に preference/comparison/uiMeta 型を追加
- [x] `GET /api/reports/preferences` を追加
- [x] `PUT /api/reports/preferences` を追加
- [x] `POST /api/reports` で `preferenceOverride` 対応
- [x] `GET /api/reports/:id` と list のレスポンスに preference/comparison 対応

## Phase 3: サーバー実装（Supabase Functions）
- [x] 比較レンジ計算ロジックを追加（直前同期間）
- [x] 目的別 comparison metrics を生成
- [x] 既存完了レポートとの score delta を計算
- [x] AIプロンプトに 7:3 トーン方針と preference/comparison 文脈を追加
- [x] 出力後のトーン補正（励まし先行）を追加
- [x] uiMeta（effect / lowData / streak / weeklyPrompt）を付与
- [x] アカウント削除時に `UserReportPreference` も削除

## Phase 4: iOS UI実装（現行デザインベース）
- [x] レポート設定（3問）モーダルを追加
- [x] 生成前に未設定なら設定モーダルへ誘導
- [x] 上部サマリーを Sticky 化（score/highlights/streak）
- [x] 初期表示を要約のみ + 詳細折りたたみ
- [x] 比較カード（前回とくらべる）を追加
- [x] 連続記録表示 + 週次誘導CTAを追加
- [x] 高低スコア演出オーバーレイを追加（Reduce Motion対応）
- [x] 共有ボタンを追加（共有カード生成→Share）

## Phase 5: 継続促進
- [x] streak API 連携で連続記録日数を表示
- [x] 7日以上で週次レポート誘導を表示
- [ ] 同一週で重複表示抑制（既読管理）

## Phase 6: 計測・KPI
- [ ] preference/comparison/detail/share/weeklyPrompt/effect のイベント計測
- [ ] KPIのしきい値監視（成功率・共有率など）

## Phase 7: テスト
- [ ] サーバー比較ロジックの単体テスト
- [ ] 7:3文面整形テスト
- [ ] iOS UIテスト（Sticky/Accordion/演出/共有）

## Phase 8: リリース
- [ ] Feature Flag による段階展開
- [ ] ロールバック手順を明文化
- [ ] 初週モニタリング運用

---

## 実装メモ
- 共有は現在 `expo-print` + `expo-sharing` で共有カードを生成しています（配信先アプリによっては PDF として扱われます）。
- 完全な PNG 画像共有に統一したい場合は、次フェーズで `react-native-view-shot` 導入が必要です。
