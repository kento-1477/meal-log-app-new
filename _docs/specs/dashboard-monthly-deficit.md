# ダッシュボード - 月間カロリー差分カード仕様

**更新日**: 2025-10-23

## 概要

ダッシュボード画面に表示される「月間カロリー差分」カードの仕様。今月の累計カロリー差分（実際の摂取 - 目標）を表示し、ダイエットの進捗を可視化する。

## 表示位置

- ダッシュボード画面上部
- カロリーリングの右隣に配置
- レスポンシブレイアウト: 幅が狭い場合は下に折り返し

## 計算ロジック

### 月間累計差分
```typescript
const targetDaily = targets.calories; // 例: 2200 kcal
let totalDelta = 0;
let dayCount = 0;

summary.calories.daily.forEach((entry) => {
  const entryDate = DateTime.fromISO(entry.date, { zone: timezone });
  if (entryDate.hasSame(now, 'month') && entryDate.hasSame(now, 'year')) {
    const delta = entry.total - targetDaily;
    totalDelta += delta;
    dayCount++;
  }
});
```

### 平均1日あたり差分
```typescript
const averageDailyDelta = dayCount > 0 ? totalDelta / dayCount : 0;
```

## カラーコーディング

| 条件 | 色 | 意味 |
|-----|-----|-----|
| `totalDelta < 0` | `colors.success` (緑) | カロリー不足 = ダイエット成功 |
| `totalDelta > 0` | `colors.error` (赤) | カロリー超過 = 摂取過多 |
| `totalDelta === 0` | `colors.textSecondary` (グレー) | 目標通り |

## 表示フォーマット

### タイトル
```
月間カロリー差分
```
翻訳キー: `dashboard.monthlyDeficit.title`

### メイン値（累計差分）
```
-15,456 kcal
```
- フォーマット: `formatDelta(totalDelta)`
- フォントサイズ: 28px
- フォントウェイト: 700
- カラー: 上記カラーコーディングに従う

### サブタイトル（記録日数と平均）
```
23日間・平均 -672 kcal
```
翻訳キー: `dashboard.monthlyDeficit.subtitle`
パラメータ:
- `{{days}}`: 記録日数
- `{{daily}}`: 平均1日あたり差分

## データ型

### Props
```typescript
interface MonthlyDeficitCardProps {
  summary: DashboardSummary;
  targets: DashboardTargets;
  t: Translate;
}
```

### 依存データ
- `summary.calories.daily[]`: 日別カロリーデータ
  - `date`: ISO8601形式の日付
  - `total`: 合計カロリー摂取量
- `summary.range.timezone`: タイムゾーン
- `targets.calories`: 目標カロリー（1日あたり）

## スタイル

```typescript
monthlyCard: {
  flex: 1,
  backgroundColor: colors.surface,
  borderRadius: 20,
  paddingVertical: spacing.lg,    // 16px
  paddingHorizontal: spacing.md,  // 12px
  justifyContent: 'center',
  gap: spacing.sm,                // 8px
}

monthlyLabel: {
  fontSize: 14,                   // textStyles.body
  color: colors.textSecondary,
  fontWeight: '600',
}

monthlyValue: {
  fontSize: 28,
  fontWeight: '700',
  color: <動的カラー>,            // success/error/textSecondary
}

monthlyMeta: {
  fontSize: 13,
  color: colors.textSecondary,
}
```

## エッジケース

### 目標カロリー未設定
- `targets.calories === null` の場合
- `totalDelta = 0`, `dayCount = 0`
- 「0 kcal」と表示

### 今月の記録なし
- `dayCount === 0` の場合
- 「0 kcal」と表示
- サブタイトル: "0日間・平均 0 kcal"

### タイムゾーン未設定
- `timezone` がnullの場合
- システムタイムゾーンを使用（DateTime.now()のデフォルト）

### 小数点の扱い
- `totalDelta`と`averageDailyDelta`は整数に丸める（`Math.round()`）
- 表示時は3桁区切りカンマを追加（`toLocaleString()`）

## 使用例

### 正常系
```
入力:
- 今月23日間記録
- 目標: 2200 kcal/日
- 実績: 平均1528 kcal/日
- 差分: -672 kcal/日

計算:
totalDelta = -672 * 23 = -15,456 kcal

表示:
月間カロリー差分
-15,456 kcal (緑)
23日間・平均 -672 kcal
```

### カロリー超過
```
入力:
- 今月15日間記録
- 目標: 2000 kcal/日
- 実績: 平均2300 kcal/日
- 差分: +300 kcal/日

計算:
totalDelta = 300 * 15 = 4,500 kcal

表示:
月間カロリー差分
+4,500 kcal (赤)
15日間・平均 +300 kcal
```

## 翻訳

### 日本語 (ja-JP)
```typescript
'dashboard.monthlyDeficit.title': '月間カロリー差分',
'dashboard.monthlyDeficit.subtitle': '{{days}}日間・平均 {{daily}}',
```

### 英語 (en-US)
```typescript
'dashboard.monthlyDeficit.title': 'Monthly calorie delta',
'dashboard.monthlyDeficit.subtitle': '{{days}} days · Avg {{daily}}',
```

## パフォーマンス

- 計算コスト: O(n) - nは今月の記録日数（通常1-31）
- メモ化: 不要（親コンポーネントでdataがメモ化済み）
- 再レンダリング: summary/targets変更時のみ

## 今後の改善案

1. **月次推移グラフ**: タップで月次トレンドを表示
2. **目標達成予測**: 現在のペースで月末の累計差分を予測
3. **週次表示**: 「今週」「今月」の切り替え
4. **パーソナライズ**: ユーザーの目標（減量/維持/増量）に応じてメッセージを変更
