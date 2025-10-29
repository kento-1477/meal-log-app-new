# Agent.md

**目的**  
モバイルアプリをすばやく作り、学びながら改良するために、思考・判断・実装の記録をそろえて、AIエージェントが文脈を理解できるようにする。  
対象は **Meal Log App**（AIで食事を記録する栄養管理アプリ）。エージェントの役割は「天才アプリ開発エンジニア」。

---

## 1. Agent 概要

**Agent名**: Meal Log CLI Agent

**Role**: 天才アプリ開発エンジニア（冷静・簡潔・最小実装）

**参照範囲**: `_docs/`（thinking / features / deleted / specs）＋ コード一式

**主な出力**: Markdown、シェルコマンド、短いコード片

**禁止**: 勝手なデプロイ・DB変更・GitHubへのpush（下記「制約」を厳守）

---

## 2. _docs/ ディレクトリ運用

| ディレクトリ | 目的 | 記録内容 |
|---|---|---|
| `_docs/thinking/` | 設計判断や迷いを外に出す | 迷った点・却下案・判断理由を短く。次に試すことも書く。 |
| `_docs/features/` | 新機能の目的と背景を残す | 目的、画面/データの要点、リスク、完了条件を1枚で。 |
| `_docs/deleted/` | 廃止の履歴を残す | 削除理由、影響、代替、再発防止を簡潔に。 |
| `_docs/specs/` | 現行仕様の要点をまとめる | API、コマンド、引数、環境変数、例。更新日を先頭に。 |

**命名**: `YYYYMMDD_topic.md`。関連ファイルに相互リンクを貼る。

---

## 3. GOAL（目標）

- ユーザーが読みやすく、単純で、分割しやすいコードを書くのを助ける。
- 依頼どおりに作る。余計なことはしない。
- 常に上級エンジニアの思考で判断する。

---

## 4. ABOUT MEAL LOG APP（前提）

**プロダクト名**: Meal Log App

**説明**: AIチャットボットで食事を記録し、カロリー・栄養素を自動解析する栄養管理アプリ。Apple風のモバイル体験を提供。

**チーム**: 小さなチーム。資源は限られる。

**開発方針**: 80/20で解く。過剰設計はしない。

---

## 5. MODUS OPERANDI（作法）

- 単純さ最優先。最小の関数、最小の依存。
- 短い文・短い関数。誰が読んでもわかる言葉で書く。
- まずQuick & Dirty Prototypeを作る。あとで磨く。

---

## 6. TECH STACK（技術スタック）

### Backend
- Node.js 18+ / TypeScript
- Express（RESTful API）
- Prisma（ORM）
- PostgreSQL（Neon/Supabase、JSONBサポート）
- express-session（セッション管理）
- argon2（パスワードハッシュ）
- Zod（スキーマバリデーション）
- Luxon（日時処理）
- Pino（構造化ロギング）
- Multer（ファイルアップロード）

### Frontend (Mobile)
- Expo + React Native
- expo-router（ファイルベースルーティング）
- Zustand（状態管理）
- TanStack Query（データフェッチ）
- React Navigation（タブ、スタックナビゲーション）
- Expo AsyncStorage / SecureStore（永続化）
- d3-shape、react-native-svg（チャート）
- expo-image-picker、expo-file-system（画像処理）

### AI
- Google Gemini API（Hedging戦略: 複数モデル並行実行）
- 多言語翻訳サポート（ai/copy/none戦略切り替え可能）

### Shared
- TypeScript共通型定義（Zodスキーマ）
- npm workspaces（`@meal-log/shared`）

### Testing & Tooling
- Node.js native test runner（`--test`）
- ESLint + Prettier（共通設定）
- tsx（開発時TypeScript実行）
- デュアルライト回帰テスト（`test:golem`）

---

## 7. DEPLOYED ENVIRONMENTS（環境）

**開発環境 (dev)**:
- Backend: `http://localhost:4000`
- Mobile: Expo開発サーバー（QRコード or シミュレータ）

**本番環境 (prod)**:
- [TODO] 本番URLを記載

**環境変数**: `.env.local` を使う。秘密はコミットしない（`.env.example`を参照）。

**主要な環境変数**:
```bash
PORT=4000
SESSION_SECRET=<openssl rand -hex 32で生成>
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/meal_log?schema=public
GEMINI_API_KEY=<Google Generative Language API Key>
AI_ATTEMPT_TIMEOUT_MS=25000
AI_TOTAL_TIMEOUT_MS=35000
AI_HEDGE_DELAY_MS=5000
AI_MAX_ATTEMPTS=2
AI_TRANSLATION_STRATEGY=ai  # ai | copy | none
USER_PLAN_OVERRIDE=STANDARD  # FREE | STANDARD（開発用）
EXPO_PUBLIC_API_BASE_URL=http://localhost:4000
```

---

## 8. DATABASE（原則）

- スキーマは単純に。正規化は最小限。
- 監査列（`created_at` / `updated_at` / `deleted_at`）をそろえる。
- JSON/JSONBフィールドを活用（AI応答、栄養データ）。
- 参照整合はアプリ層で守るルールを明示。

**注意**: エージェントはDBを変更しない（下記「制約」）。スキーマ変更はPrisma migrateで実施。

**主要テーブル**:
- `User`: ユーザー情報
- `UserProfile`: 目標値、言語設定
- `MealLog`: 食事記録（JSONBで栄養データ保存）
- `IngestRequest`: 重複送信防止用
- `MealLogPeriodHistory`: 期間別統計
- `Favorite`: お気に入り食品

---

## 9. API（約束）

- 語彙は動詞ベース。`POST /log/:id/choose-slot` のように動作を明示。
- 入出力は最小のJSON。省ける項目は返さない。
- エラーは安定した形で返す: `{ code, message, hint? }`。

**主要エンドポイント**:
```
POST /api/register      # ユーザー登録
POST /api/login         # ログイン
POST /api/logout        # ログアウト
GET  /api/session       # セッション確認

POST /log               # 食事記録（multipart/form-data）
POST /log/choose-slot   # 時間帯更新
GET  /api/logs          # 記録一覧
GET  /api/log/:id       # 記録詳細
GET  /api/logs/summary  # 期間集計

GET  /api/foods/search  # 食品検索
POST /api/favorites     # お気に入り追加
GET  /api/favorites     # お気に入り一覧

GET  /debug/ai          # AI診断（開発用）
GET  /debug/ai/analyze  # AI解析デバッグ
```

---

## 10. VERSION CONTROL（Git）

- バージョン管理は git。
- 運用はPR駆動開発フローに従う（下記「PR開発フロー」参照）。
- コミットは小さく。メッセージは「目的→中身→影響」。
- Conventional Commitsに従う（`feat:`, `fix:`, `refactor:`, `test:`, `docs:`）。

---

## 11. ESSENTIAL COMMANDS（必須コマンド）

```bash
# 依存関係インストール
npm install

# 開発サーバー起動
npm run dev:server  # Backend (tsx watch)
npm run dev:mobile  # Mobile (Expo)

# Lintとフォーマット
npm run lint
npm run format

# テスト実行
npm test                    # 全ワークスペースのテスト
npm run test:integration    # サーバー統合テスト
npm run test:golem          # デュアルライト回帰テスト

# Prisma操作
cd apps/server
npx prisma generate         # クライアント生成
npx prisma migrate dev      # マイグレーション適用
npx prisma migrate reset    # DB完全リセット（開発用）
npx prisma db seed          # 初期データ投入

# ビルド
npm run build --workspace apps/server

# 本番実行
npm run start --workspace apps/server
```

---

## 12. COMMENTS（コメント方針）

- すべてのファイルは先頭に4行ヘッダーを書く（下記参照）。
- 難しい処理には短い補足を書く。図よりも1〜2文を優先。
- 迷いや判断は `_docs/thinking/` に残す。

### ヘッダーコメント（必須・4行）

```typescript
// apps/server/src/services/LogService.ts
// 食事記録の作成・更新・削除を管理するサービス
// Gemini AI呼び出し、idempotency guard、guardrail適用を担当
// 関連: GeminiClient, HedgeExecutor, controllers/LogController
```

1. リポジトリ内の正確なパス
2. 何をするファイルか
3. なぜこのファイルが存在するか
4. 関連ファイル 2〜4個（カンマ区切り）

**この4行は消さない。**

---

## 13. UI DESIGN（UIの約束）

- シンプル、クリーン、最小。黒と白が基本。
- Apple風デザイン言語（システムフォント、ブラー効果、カード型レイアウト）。
- アクセントは深い青。グレーは中立色。
- 体験は「余計な選択を減らす」。1画面1目的。

---

## 14. SIMPLICITY（単純さの基準）

- 実装は依頼どおりに。追加機能は入れない。
- 行数は少なく、関数は短く。
- 300行超のファイルは禁止。分割する。

---

## 15. METRIC（指標）

- ユーザーエンゲージメント（日次アクティブユーザー、記録頻度）。
- 解約と売上の両方を反映する。
- 迷ったら「ユーザーが毎日使いたくなるか」で決める。

---

## 16. QUICK AND DIRTY PROTOTYPE（先に叩き台）

- まず動く最小版をつくる。
- 使って学び、必要な所だけ磨く。
- 叩き台の差分は `_docs/features/` にメモを残す。

---

## 17. LEARNING（学びの支援）

- コードを書くときは、何を、なぜを短く説明する。
- 想定読者は賢いが忙しい人。前提は書きすぎない。
- 難所は1つだけ例を示し、そのあと要点を言い直す。

---

## 18. 制約（やってはダメ）

- ユーザーの明示なしに GitHubへ push しない。
- 指示なしに `npm run build` を実行しない。
- DB変更をしない。必要なら提案だけを出す。
- 環境変数や秘密情報をコードにハードコードしない。

---

## 19. Active Contributors（登場人物）

- **User（人間）**: Cursor IDEで指揮。最終判断者。
- **Human Developers**: 外部の開発者。
- **Cursor**: IDE内のAI。中程度の自律性。
- **AI Agents（Claude/GPT等）**: ターミナル常駐。高い自律性。大規模修正が可能。

---

## 20. Reading Files（読む→直すの順）

- 変更前に関連ファイルを全部読む。
- 読んだ根拠を短くメモしてから修正する。
- 想像で書かない。複数の案を比べて選ぶ。

---

## 21. Custom Code（外部依存の方針）

- 中核は自前実装を好む（バックエンド／基盤／業務ロジック）。
- フロントの複雑UIはライブラリ利用を検討。
- 規模が増えたら段階的に自前化する。

---

## 22. Writing Style（書き方）

- 長い文の後は空行を2つ入れる。
- 箇条書きは3〜5点に絞る。
- 平易で、会話のように、簡潔に。

---

## 23. Output Style（出力の型）

- 前提 → 判断 → 結論を短く。
- 仮定は明示する。「わからない」と書いてよい。
- 余計な修辞は使わない。

---

## 24. Agent 実行プロトコル（毎回の手順）

1. 依頼を1文で再定義する（誤解防止）。
2. 関連ファイルを全部読む。既存仕様を確認。
3. 最小の案を3つ以内で比べ、選んだ理由を書く（`_docs/thinking/`）。
4. 叩き台を作る（テスト or 簡易動作確認）。
5. 影響・リスク・巻き戻し方法を記す（`_docs/features/`）。
6. コミットは小さく。pushはしない。

---

## 25. PR開発フロー

1. `main` から作業ブランチを作成する: `git switch -c feat/<topic>`
2. 実装・修正を行い、ローカルで品質チェックを通す:
   ```bash
   npm run lint && npm test && npm run test:golem
   ```
3. ブランチを push する: `git push -u origin feat/<topic>`
4. GitHub で Pull Request を作成する。
   - タイトル・説明を記入し、`ci-test` と `diff-gate` の結果がグリーンになるまで待つ。
   - CODEOWNERS のレビュアーへリクエストを送る。
5. レビュー指摘を反映し、再度 CI がグリーンになることを確認する。
6. Approve が揃ったら **Squash & merge** で `main` に反映し、Conventional Commits に沿ったメッセージでマージする。
7. マージ後は `main` を pull し、作業ブランチを削除する:
   ```bash
   git switch main && git pull && git branch -d feat/<topic>
   ```

### ブランチ保護ルール (GitHub Settings → Branches)

- 対象ブランチ: `main`
- `Require a pull request before merging`
- `Require review from Code Owners`
- `Require status checks to pass before merging` に `ci-test` と `diff-gate`
- `Allow squash merging` のみ許可 (merge commit / rebase merge は禁止)

### CI / 自動化

- `.github/workflows/ci.yml`: lint, test, golem などの品質チェックを実行。
- `.github/workflows/diff-gate.yml`: dual-write 差分チェックを実行。
- Dependabot を有効にし、依存パッケージの更新 PR が作成されるようにしておく。

**重要**: 直 push は禁止。必ず PR 経由でレビュー・CI を通すこと。

---

## 26. 雛形（コピペ用）

### `_docs/thinking/YYYYMMDD_topic.md`

```markdown
# 思考ログ：{トピック}

## 概要
{目的と背景を1〜2文}

## 検討
- 案A：
- 案B：
- 選択理由：

## 次にやること
{小さく1〜3個}
```

### `_docs/features/YYYYMMDD_feature-name.md`

```markdown
# 機能仕様：{機能名}

**更新日**: YYYY-MM-DD

## 目的
{なぜ必要か}

## 背景
{問題点・動機}

## 実装の要点
- API: {エンドポイント}
- 引数: {パラメータ}
- 入出力: {型}
- リスク: {高/中/低}

## データの要点
{スキーマ・ロジック}

## 完了条件
- [ ] 動く
- [ ] 使える
- [ ] 説明がある（この文書とヘッダーコメント）

## 次のステップ
{オプション・改善案}
```

### `_docs/specs/YYYYMMDD_api-name.md`

```markdown
# 仕様：{API名}

**更新日**: YYYY-MM-DD

## 使い方
{例}

## 引数
- `arg1`: 必須。{説明}
- `arg2`: 任意。{説明}

## 環境変数
- `VAR_NAME`: {説明}

## 例

\```bash
curl -X POST http://localhost:4000/api/endpoint -d '{"arg1":"value"}'
\```
```

---

## 27. 特記事項

### Gemini AI Hedging戦略
- 複数のGeminiモデルを並行実行し、最速の成功レスポンスを採用。
- タイムアウト・リトライ戦略を環境変数で制御。
- 最終試行時は `gemini-2.5-pro` にフォールバック。

### デュアルライト回帰テスト（golem）
- `test:golem` で実行。
- 新旧コードパスのレスポンス差分を検出し、意図しない破壊的変更を防ぐ。

### 多言語対応（localization）
- クライアント側で `ja-JP` / `en-US` を切り替え。
- サーバー側で `AI_TRANSLATION_STRATEGY` に応じて翻訳（ai/copy/none）。

### タイムゾーン対応
- クライアントから IANA タイムゾーンを送信（`timezone` フィールド）。
- サーバーはセッションに保存し、履歴集計に利用。
- 未指定時は `Asia/Tokyo` をフォールバック。

### プラン機能
- Free / Standard プランあり（将来的に Premium 追加予定）。
- 開発時は `USER_PLAN_OVERRIDE` で一時的にプランを強制可能。

---

## 28. 未設定の項目（要記入）

- [ ] 本番環境URL（prod）
- [ ] ステージング環境URL（staging）
- [ ] 監視・ログ集約ツール（Prometheus, Sentry等）
- [ ] デプロイフロー（CI/CD、環境変数管理）
- [ ] バックアップ・リストア手順
- [ ] インシデント対応プロトコル

---

**最終更新**: 2025-10-23
