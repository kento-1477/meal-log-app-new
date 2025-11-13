# Sign in with Apple – Decision & Prep Checklist

## 現状まとめ
- モバイル版（`apps/mobile/app/login.tsx`）はメール+パスワードのみ対応。
- バックエンド（`apps/server/src/routes/auth.ts` 等）もメール/パスワード前提でAPI・Zodスキーマが固定。
- Prisma `User` モデルは `passwordHash` 必須、Apple固有IDやトークン保存領域なし。
- Expo設定（`apps/mobile/app.json`）や依存関係に `expo-apple-authentication` などが未導入。

## 今回の意思決定
- **MVPはメールログインのみでApp Storeへリリースする。**
  - 理由: iOS限定リリースとはいえメールログインで基本体験は提供でき、Appleサインイン実装のデータ層/サーバー/クライアント対応に1–2スプリント掛かるため、まずは速度重視で出す。
  - 影響: リリース後に「Appleでサインイン」機能を追加するアップデートを行い、再度審査を受ける予定。

## 将来実装に向けた準備TODO
1. **Appleデベロッパー設定**
   - `com.meallog.app` で Sign in with Apple を有効化し、Services ID / Key ID / Team ID / private key / redirect URI を整理。
   - 秘密鍵の保管形式とCIシークレット登録フローを決める（改行エスケープ or ファイル配置）。
2. **データモデル**
   - `User` モデルに Apple専用ID(appleSubject) などを追加するか、`UserIdentity` テーブルを新設するか決定。
   - マイグレーションとPrisma Client再生成、既存データへの安全なデフォルト設定手順を用意。
3. **環境変数と設定**
   - `.env` と `apps/server/src/env.ts` に APPLE_TEAM_ID / APPLE_CLIENT_ID / APPLE_KEY_ID / APPLE_PRIVATE_KEY / APPLE_REDIRECT_URI / （必要なら）APPLE_CLIENT_SECRET を追加し型検証。
4. **サーバーAPI**
   - Appleトークン検証サービス（`apple-auth-service` 仮）を実装し、`/api/login/apple` エンドポイントを追加。
   - ノンス/ステート発行と検証の仕組みを決めて、リプレイ攻撃を防止。
   - 例外コード（例: `INVALID_APPLE_TOKEN`, `ACCOUNT_LINK_CONFLICT`）を定義し、既存レスポンス形式に合わせる。
   - Appleサインインの統合テスト（成功/失敗/既存ユーザー紐付け）を作成。
5. **共有スキーマ**
   - `packages/shared` に Appleログイン用リクエスト&レスポンススキーマを追加し、モバイルとサーバーで共通化。
6. **モバイル側の準備**
   - `expo-apple-authentication` 依存追加、`app.json` にプラグインと `ios.usesAppleSignIn` を設定。
   - `login.tsx` に Appleボタン/ローディング/UI文言を追加し、`AppleAuthentication.isAvailableAsync()` で表示制御。
   - `src/services/api.ts` に `loginWithApple` を実装し、セッション更新フローを共通化。
   - i18nに「Appleでサインイン」等の文言を追加。
7. **ドキュメント & リリース**
   - README/_docsに環境変数、Appleポータル設定、EAS Build手順、既存ユーザーとのリンク戦略、デバッグ手順を追記。
   - CI/CDにApple関連シークレットを登録し、リリースチェックリストへ組み込む。

## フォローアップ
- MVPリリース後、ユーザーのログイン離脱率や要望を確認し、上記TODOを優先度順に着手する。
- 進捗が出たらこのドキュメントにタイムライン・担当者・依存Issueを追記する。
