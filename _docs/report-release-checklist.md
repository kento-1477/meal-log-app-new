# AIレポート リリースチェックリスト

## 目的
レポート関連の変更で必ず確認する観点を短時間で揃える。

## 変更前に確認すること
- 影響範囲の洗い出し（UI/Edge/共有スキーマ/マイグレーション）
- 後方互換性の有無とロールバック方針の明記

## 変更後に確認すること
- `apps/mobile/tests/report-ui-v2.test.ts` の更新有無
- `apps/mobile/tests/day-boundary.test.ts` の更新有無
- `supabase/functions/meal-log/report-release.test.ts` の更新有無
- 日付境界（4am等）とタイムゾーン補正の整合
- 音声モード/要約日付の永続化の整合

## リリース判断
- UIのみ / Edgeのみ / DB migrationありの区分で戻し方を整理
- 監視やKPI更新が必要な場合は手順をメモに残す
