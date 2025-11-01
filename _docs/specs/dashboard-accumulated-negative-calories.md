# ダッシュボード - 今月の積み上げマイナスカロリー（現行ロジック）

**更新日**: 2025-10-31

## 概要

ダッシュボードの「今月の積み上げマイナスカロリー」カードで使用している現行ロジックと、将来的な改善ポイントをまとめる。表示値は「その日のマイナスカロリー（消費が摂取を上回った分）」を月間で積み上げた合計。

## 日次ロジック

```typescript
const baselineDaily = resolveDailyBaseline(); // 現状は target_calories を日数で割った値
const intake = Math.max(entry.total, 0);      // 記録が無い日は0として扱う

const dailyDeficit = intake > 0 ? Math.max(baselineDaily - intake, 0) : 0;
return sum + dailyDeficit;
```

- `resolveDailyBaseline` はプロフィールの `target_calories` を月間サマリーの日数で割り戻した値。未設定時は 2,200 kcal を使用。
- 運動カロリーはまだ扱っていない（0 とみなしている）。

## 月間合計

- 取得データ: `getDashboardSummary('custom', { from: 月初, to: 今日 })` の `calories.daily`
- 積み上げ対象: `entry.total > 0` の日だけ差分を計算し、`dailyDeficit` を加算
- 表示値: `formatDelta(-monthlyDeficit)` でマイナス表記（例: `-3,200 kcal`）。積み上げが 0 の場合は `0 kcal`

## プログレスバー

- 理論最大値: `baselineDaily × (月初〜今日までの実稼働日数)`
- 進捗: `monthlyDeficit / 理論最大値` を 0〜1 にクランプ
- バーは緑グラデーションで塗り、オーバーフロー表示はなし

## 既知の制約

1. **ベースラインが暫定値** – プロフィール未設定の場合は 2,200 kcal で固定。今後 TDEE 推定に差し替え予定。
2. **運動カロリー非対応** – 消費カロリーの追加記録が入るまでは 0 扱い。
3. **追加 API 呼び出し** – 月間 summary を毎回取得する（React Query で 5 分間キャッシュ）。

## 将来の改善案

| 項目 | 内容 | 優先度 |
|------|------|--------|
| ベースライン最適化 | BMR/TDEE 推定で `target_calories` 未設定ユーザーにも適切な目安を提供 | 高 |
| 運動カロリー統合 | アクティビティログを取り込み `baseline + exercise` に拡張 | 中 |
| 表示バリエーション | 今週との比較・履歴グラフなどの追加 UI | 低 |

## テスト観点

1. 摂取記録が無い日は積み上げ 0 になる（カード表示は `0 kcal`）。
2. 摂取 < ベースラインの日があると、その差分だけ積み上がる。
3. プロフィールの `target_calories` を変更すると合計値とバーが更新される。
4. 月が変わると新しい月の集計に切り替わる。
