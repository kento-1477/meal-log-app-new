---
name: report-release-guard
description: AIレポート関連の変更（report.tsx, meal-log edge function, shared schema, api service）が含まれるときに、契約破壊・競合・ロールバック不能を防ぐためのレビュー前チェックを実行する。PRレビュー準備や修正後の再検証時に使う。
---

# Report Release Guard

対象ファイルに `apps/mobile/app/report.tsx` または `supabase/functions/meal-log/index.ts` が含まれる場合に実行する。

## 入力
- 変更ファイル一覧
- 代表コミットメッセージ（直近1〜3件）

## 手順
1. 契約面チェックを作成する
   - APIレスポンス形状（特に `streakDays`）
   - 即時done応答時の状態遷移
   - キャンセル時の二重実行/競合

2. 最小再現テストを3件まで作成する
   - 失敗条件→期待結果→確認コマンドの順で記述する。

3. ロールバック可否を判定する
   - UIのみ、Edgeのみ、DB migrationありの3区分で戻し方を示す。

## 出力フォーマット
以下3見出しだけで出力する。
- 契約リスク
- 最小再現テスト
- ロールバック判断
