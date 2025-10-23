# Meal Log Localization API Changes

このドキュメントでは、AI 応答の多言語化に向けて追加された API パラメータとレスポンス仕様をまとめます。

## ロケールの扱い

- ロケールは BCP 47 形式の文字列（例: `ja-JP`, `en-US`）。
- クライアントは現在のアプリロケールをリクエストごとに送信する。
- サーバーはセッション・クエリ・ボディからロケールを解決し、AI や DB へのアクセス時に利用する。
- 未指定の場合は `en-US` を既定値として扱う。

## 新規フィールド

### リクエスト

| 対象 | フィールド | 型 | 備考 |
| ---- | ---------- | -- | ---- |
| `POST /log` | `locale` | string | 任意。未指定時はセッション or 既定値を利用。 |
| `GET /logs` 系 | `locale` | string | クエリパラメータ。クライアントが希望する言語を指定。 |

### レスポンス共通フィールド

- `ai_raw.locale`: 保存された AI 解析の基準ロケール。
- `ai_raw.translations`: `{ [locale]: GeminiNutritionResponse }` 形式。存在するロケールの解析結果を格納。
- `translations` を持たない既存データはレスポンス生成時に `ai_raw` のトップレベル値が利用される。

## エンドポイント別仕様

### POST /log

#### リクエスト

- `FormData` に `message`, `image` に加え、任意の `locale` フィールドを追加可能。
- ヘッダー `Accept-Language` が指定されている場合は、ボディの `locale` より低優先で参照。

#### レスポンス

```jsonc
{
  "ok": true,
  "success": true,
  "logId": "cuid",
  "dish": "チキンカレー",
  "confidence": 0.82,
  "totals": { "kcal": 650, "protein_g": 32, "fat_g": 20, "carbs_g": 70 },
  "translations": {
    "ja-JP": { "dish": "チキンカレー", ... },
    "en-US": { "dish": "Chicken curry", ... }
  },
  "locale": "ja-JP",
  "meta": { ... }
}
```

- `dish`, `totals`, `items` は要求ロケールの翻訳を優先し、存在しない場合はフォールバック（順序: 要求ロケール → `ja-JP` → `en-US` → 任意の翻訳 → 従来のトップレベル値）。

### GET /logs /logs/summary /log/:id /log/:id/share /logs/export

- クエリ `locale` が指定された場合は対応する翻訳を返却する。
- フォールバック順は POST と同じ。
- レスポンスの `ai_raw` には `translations` と `locale` が含まれる。
- `share.text` や `export.items[].foodItem` はリクエストロケールに基づいた翻訳を利用する。

## 非互換性の扱い

- 既存レコードには `translations` が存在しないため、フォールバックにより従来と同じ英語表示となる。
- 将来的にバッチ処理で `translations['ja-JP']` を追加し、多言語 UI に段階的に対応する。

