# お気に入り（よく食べるセット） API 概要

| メソッド | パス | 概要 |
| --- | --- | --- |
| `GET` | `/api/favorites` | ユーザーのお気に入り一覧を `items` として返す |
| `POST` | `/api/favorites` | お気に入りを新規作成する |
| `GET` | `/api/favorites/:id` | お気に入りの詳細を取得する |
| `PATCH` | `/api/favorites/:id` | お気に入りの名称・メモ・内訳を更新する（アイテムは置き換え） |
| `DELETE` | `/api/favorites/:id` | お気に入りを削除する |
| `POST` | `/api/favorites/:id/log` | お気に入りをもとに食事ログを即時作成する（AI 不要） |

## リクエスト/レスポンス（サマリ）

### 作成リクエスト例

```json
{
  "name": "焼き鮭定食",
  "notes": "朝食セット",
  "totals": { "kcal": 620, "protein_g": 32, "fat_g": 18, "carbs_g": 70 },
  "items": [
    { "name": "焼き鮭", "grams": 120, "protein_g": 26, "fat_g": 12, "carbs_g": 0 },
    { "name": "味噌汁", "grams": 200, "protein_g": 6, "fat_g": 3, "carbs_g": 10 }
  ]
}
```

### レスポンス例

```json
{
  "ok": true,
  "item": {
    "id": 3,
    "name": "焼き鮭定食",
    "notes": "朝食セット",
    "totals": { "kcal": 620, "protein_g": 32, "fat_g": 18, "carbs_g": 70 },
    "created_at": "2025-03-01T08:30:00.000Z",
    "updated_at": "2025-03-01T08:30:00.000Z",
    "items": [
      { "id": 7, "name": "焼き鮭", "grams": 120, "protein_g": 26, "fat_g": 12, "carbs_g": 0, "order_index": 0 },
      { "id": 8, "name": "味噌汁", "grams": 200, "protein_g": 6, "fat_g": 3, "carbs_g": 10, "order_index": 1 }
    ]
  }
}
```

## `processMealLog` のお気に入り候補

`POST /log` のレスポンスには `favoriteCandidate` が追加され、チャット側でお気に入り登録フォームを自動生成できます。また、お気に入りからの即時ログ作成では `/api/favorites/:id/log` を呼び出すと同等のレスポンスが返ります。

```json
{
  "favoriteCandidate": {
    "name": "Grilled salmon",
    "totals": { "kcal": 620, "protein_g": 32, "fat_g": 18, "carbs_g": 70 },
    "items": [...],
    "source_log_id": "clwxyz..."
  }
}
```

## QA メモ

- Prisma migration `20251206000000_add_favorite_meals`
- Integration test: `apps/server/tests/integration/favorites.test.ts`
- モバイル: `npm test` で既存スナップショットと utils テストが通ることを確認
