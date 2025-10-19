# ローカライズ対応仕様

## ロケール指定

- クライアントは BCP 47 形式（例: `ja-JP`, `en-US`）の `locale` パラメータを渡す。
- `POST /log` は JSON ボディまたは form-data に `locale` を含める。
- GET 系エンドポイント（`/api/logs`、`/api/log/:id`、`/api/dashboard/summary`、`/api/dashboard/targets`、`/api/logs/export`、`/api/streak`）はクエリに `locale` を付与する。
- サーバーはセッションに `preferredLocale` を保持し、パラメータが省略された場合はセッション値→`Accept-Language` ヘッダー→`ja-JP` の順で解決する。

## 保存形式

`MealLog.aiRaw` に以下の構造を追加する。

```json
{
  "dish": "Oatmeal with Tuna",
  "items": [
    { "name": "Oatmeal", "grams": 100 },
    { "name": "Tuna", "grams": 70 }
  ],
  "translations": {
    "en-US": {
      "dish": "Oatmeal with Tuna",
      "items": [
        { "name": "Oatmeal" },
        { "name": "Tuna" }
      ],
      "warnings": []
    },
    "ja-JP": {
      "dish": "ツナ入りオートミール",
      "items": [
        { "name": "オートミール" },
        { "name": "ツナ缶（水煮）" }
      ],
      "warnings": []
    }
  }
}
```

- `translations[locale]` には `dish`、`items[]`、`warnings[]` を含む。
- `items[]` には最低限 `name` を保持し、数値系は元の `totals`/`items` を参照。
- 未翻訳時は `translations` にキーを追加せず、レスポンス側でフォールバックメッセージを添付する。

## レスポンス仕様

- すべての API の `meal` 関連レスポンスで `translationLocale` と `translationFallback` を追加する。
  - `translationLocale`: 実際に返却した言語キー。
  - `translationFallback`: リクエスト locale と異なる場合に `"en-US"` などを設定。
- フォールバック発生時は `warnings` に `translation_fallback:<locale>` を push してクライアントに通知する。

## 互換性

- 既存データは `translations` が無いので、フォールバックで従来通りの英語表示になる。
- 新規 ingestion 時は `translations[locale]` を必ず生成し、`translations['en-US']` が存在しない場合は AI 応答そのものを格納する。
- 既存のクライアントが locale を渡さない場合は `ja-JP` を用いて従来挙動を維持する。
