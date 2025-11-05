# Mailto Link Behavior

## 現象
ログイン画面の「パスワードをお忘れですか？」は `mailto:support@meal-log.app` を開きます。iOS シミュレータなどメールアプリのない環境では `Linking.openURL` が失敗するため、アラート「メールアプリを開けませんでした」を表示してユーザーに手動送信を案内します。

## 対策
- 実機で標準メールアプリが利用可能なら問題なく起動します。
- シミュレータやカスタムビルドで mailto を有効にしたい場合は、`Info.plist` の `LSApplicationQueriesSchemes` に `mailto` を追加してください。
- 失敗時アラートの文言は `apps/mobile/src/i18n/index.ts` で管理しています。

## 関連ファイル
- `apps/mobile/app/login.tsx`
- `apps/mobile/src/i18n/index.ts`
