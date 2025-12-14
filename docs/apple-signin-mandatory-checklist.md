# Apple Sign In 必須化（オンボーディング後）実装チェックリスト

## 方針（要確認の決定）

- iOSのみ対象（Androidは未対応メッセージ表示）
- 既存ユーザー0人想定のため、メール/パスワード認証は完全削除してOK
- 必須画面の文言はスクショ寄せ（「作成したプランを保存するために…」は維持）

---

## フェーズ0: 準備

- [x] 作業ブランチ作成
- [x] 本チェックリスト追加

## フェーズ1: 未ログインでもオンボーディング開始できる導線

- [x] 未ログイン時の起動導線を`/(onboarding)/welcome`へ変更（`/login`固定を撤去）
- [x] タブ/深いリンクで未ログイン時はオンボーディングへ誘導
- [x] オンボーディングWelcomeの「ログインに戻る」導線を整理（未ログイン前提）

## フェーズ2: オンボーディング完了後にApple必須画面へ

- [x] `analysis`でサーバー保存をしない（ゲストでプラン生成→次へ）
- [x] `analysis`の次アクションを`apple-connect`へ固定（スキップ不可前提）

## フェーズ3: Apple必須画面（デザイン＋サインイン＋保存）

- [x] 画面レイアウトをスクショ寄せ（中央ロゴ/タイトル/Appleボタン/下部法務リンク）
- [x] スキップ導線削除
- [x] Appleサインイン（`/api/login/apple`）に統一
- [x] サインイン後にオンボーディング内容をサーバー保存（`/api/profile`）し、完了扱いにする
- [x] iOS以外は未対応表示（行き止まりでもOK）

## フェーズ4: メール/パスワード認証の撤去（モバイル）

- [x] `login`画面をAppleのみへ（フォーム/新規登録導線削除）
- [x] `register`画面/ルートを削除
- [x] 設定の「パスワード変更」導線を削除
- [x] 未使用のAPIクライアント関数（`login/registerUser/linkAppleAccount`）を整理

## フェーズ5: バックエンド（Supabase Edge Functions）整理

- [x] `/api/register`・`/api/login`・`/api/link/apple`を廃止（Appleログイン/セッション/ログアウトのみ）
- [x] `auth.apple_conflict`などのメッセージをApple-only前提へ修正

## フェーズ6: 法務リンク整備（必要最小）

- [x] `TERMS_OF_SERVICE_URL`を`privacy-policy`と分離
- [x] `docs/terms-of-service.md`を追加（GitHub Pagesで表示できる形）

## フェーズ7: 検証

- [x] `npm -w apps/mobile test`が通る
- [x] `app.json`に`scheme`を設定（expo-linkingのクラッシュ回避）
- [x] iOSでSign in with Appleを有効化（`ios.usesAppleSignIn` + `expo-apple-authentication`）
- [ ] iOSビルドが通る（hoisted `react-native` の参照解消）
- [ ] 主要導線の手動確認（オンボーディング→Apple→保存→チャット）
