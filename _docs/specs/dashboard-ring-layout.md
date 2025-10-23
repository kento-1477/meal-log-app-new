# ダッシュボード - リングレイアウト仕様

**更新日**: 2025-10-23

## 概要

ダッシュボード画面のカロリー/マクロ栄養素リング表示の配置とスタイリング仕様。

## レイアウト構成

### 1行目: カロリーリング + 月間差分カード
```
┌─────────────────────────────────────┐
│ [カロリーリング] [月間差分カード]   │
│    flex: 1          flex: 1         │
└─────────────────────────────────────┘
```

スタイル:
```typescript
topRow: {
  flexDirection: 'row',
  gap: spacing.md,  // 12px
}

calorieRingContainer: {
  flex: 1,
}
```

### 2行目: マクロリング3つ
```
┌─────────────────────────────────────┐
│ [たんぱく質] [炭水化物] [脂質]      │
│   flex: 1      flex: 1    flex: 1   │
└─────────────────────────────────────┘
```

スタイル:
```typescript
macroRow: {
  flexDirection: 'row',
  gap: spacing.md,  // 12px
}
```

## リングサイズ

### カロリーリング（大）
```typescript
const LARGE_RING_SIZE = 140;      // px
const LARGE_STROKE_WIDTH = 12;    // px
```

### マクロリング（小）
```typescript
const SMALL_RING_SIZE = 110;      // px
const SMALL_STROKE_WIDTH = 9;     // px
```

## リングカードスタイル

### カロリーカード
```typescript
calorieCard: {
  backgroundColor: colors.surface,
  borderRadius: 20,
  paddingVertical: spacing.lg,    // 16px
  paddingHorizontal: spacing.lg,  // 16px
  alignItems: 'center',
  gap: spacing.md,                // 12px
}
```

### マクロカード
```typescript
macroCard: {
  flex: 1,
  backgroundColor: colors.surface,
  borderRadius: 20,
  paddingVertical: spacing.lg,    // 16px
  paddingHorizontal: spacing.lg,  // 16px
  alignItems: 'center',
  gap: spacing.sm,                // 8px
}
```

## テキストスタイル

### カードラベル（栄養素名）
```typescript
cardLabel: {
  fontSize: 13,                   // textStyles.caption
  color: colors.textSecondary,
  fontWeight: '600',
}
```
例: "カロリー", "たんぱく質", "炭水化物", "脂質"

### パーセンテージ（全リング共通）
```typescript
percentText: {
  fontSize: 24,                   // textStyles.titleLarge
  color: colors.textPrimary,
  fontWeight: '700',
}
```
**注**: カロリーリングも同じサイズ（`percentTextLarge`は廃止）

### 数値表示（現在/目標）
```typescript
// カロリーリング
ratioValueLarge: {
  fontSize: 16,                   // textStyles.titleSmall
  color: colors.textPrimary,
  fontWeight: '600',
}

// マクロリング
ratioValue: {
  fontSize: 12,
  color: colors.textPrimary,
  fontWeight: '600',
}
```
例: "1528 / 2200 kcal", "85 / 130 g"

### 差分表示（残り/超過）
```typescript
deltaText: {
  fontSize: 12,                   // textStyles.caption
  color: colors.textSecondary,
}

deltaTextOver: {
  color: colors.error,
  fontWeight: '600',
}
```
例: "672 kcal 残り", "46 g 残り"

## リング描画

### SVGコンポーネント
```typescript
interface RingProps {
  size: number;           // リングサイズ（140 or 110）
  strokeWidth: number;    // 線の太さ（12 or 9）
  progress: number;       // 0.0 ~ 1.0
  color: string;          // リング色
  trackColor: string;     // 背景トラック色
}
```

### 描画ロジック
```typescript
const radius = (size - strokeWidth) / 2;
const circumference = 2 * Math.PI * radius;
const clamped = clamp(progress, 0, 1);
const dashOffset = circumference * (1 - clamped);

// 背景トラック
<Circle cx={size/2} cy={size/2} r={radius} stroke={trackColor} ... />

// プログレスリング（-90度から開始）
<Circle 
  cx={size/2} cy={size/2} r={radius} 
  stroke={color}
  strokeDasharray={circumference}
  strokeDashoffset={dashOffset}
  transform={`rotate(-90 ${size/2} ${size/2})`}
/>
```

## カラーパレット

### リング色
| 栄養素 | カラートークン | 実際の色 |
|-------|---------------|---------|
| カロリー | `ringKcal` | `colors.accent` (青) |
| たんぱく質 | `ringProtein` | オレンジ |
| 炭水化物 | `ringCarb` | 紫 |
| 脂質 | `ringFat` | 赤 |

### トラック色
```typescript
trackColor: colors.border  // 薄いグレー
```

## データフロー

### 入力データ
```typescript
interface MacroRingProps {
  label: string;          // "カロリー", "たんぱく質", etc.
  current: number;        // 現在の摂取量
  target: number;         // 目標値
  unit: string;          // "kcal", "g"
  colorToken: RingColorToken;
}
```

### リング状態計算
```typescript
const state = buildRingState(data, t);
// state.progress: 0.0 ~ 1.0
// state.ringColor: 実際のカラー値
// state.trackColor: トラック色
// state.currentText: "1528"
// state.targetText: "2200"
// state.deltaText: "672 kcal 残り"
// state.status: 'under' | 'over' | 'onTarget'
```

## レスポンシブ動作

### 画面幅が狭い場合
- `topRow`: `flexWrap: 'wrap'` は未設定
- 両方のカードが均等に縮小（`flex: 1`）
- 極端に狭い場合は横スクロールが発生（意図的）

### 推奨最小幅
- カロリーリング最小幅: 180px（リング140px + パディング40px）
- 月間差分カード最小幅: 200px
- 合計推奨幅: 400px以上

## パフォーマンス考慮

### リング再描画
- `progress`変更時のみ再描画
- SVGはネイティブレンダリング（高速）

### メモ化
```typescript
const ringData = useMemo(() => {
  if (!data?.comparison) return null;
  // リングデータ計算...
}, [data?.comparison, t]);
```

## アクセシビリティ

### Accessible props
```typescript
accessible={true}
accessibilityRole="image"
accessibilityLabel={state.accessibilityLabel}
// 例: "カロリー 1528 kcal / 2200 kcal、672 kcal 残り"
```

## 今後の改善案

1. **インタラクティブ**: タップでモーダル表示（詳細データ）
2. **アニメーション**: リングの進捗アニメーション（0%→69%）
3. **サイズ統一**: 全リングを同じサイズに（デザインレビュー結果）
4. **グリッドレイアウト**: 2x2グリッドで4つのリングを均等配置
