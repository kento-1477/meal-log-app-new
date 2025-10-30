# 2025-03-29 Paywall / IAP テストログ

## 概要
- 実施日: 2025-03-29
- 環境: iPhone 16 シミュレータ（iOS 18.1） / ローカルサーバー (`IAP_TEST_MODE=true`)
- テストユーザー: `demo@example.com` / `password123`
- バックエンド: `npm run dev:server`（テストレシートを受け付けるモード）

## 手動テスト結果
| # | シナリオ | 手順 | 結果 |
|---|---|---|---|
| 1 | 無料ユーザーで Paywall 表示 | 設定タブ > プレミアムプランボタン。価格取得失敗時のリトライ含め UI を確認。 | ✅ ヘッダー、特典リスト、再読み込みボタンの表示を確認。 |
| 2 | 購入成功 | `purchasePremiumPlan` を実行し、テストレシート (`com.meallog.premium.annual`) を送信。 | ✅ `PremiumStore` と `SessionStore` が即時にプレミアム化。ダッシュボードに戻りロックが解除。 |
| 3 | 購入キャンセル | IAP リスナーで `iap.cancelled` を発火させる（キャンセルダイアログを表示して閉じる）。 | ✅ Alert が表示されず、画面がそのまま維持。`trackPaywallPurchaseCancel` が送信されたことをログで確認。 |
| 4 | ネットワーク失敗 | `submitIapPurchase` を一時的に失敗させて `iap.error` を発火。 | ✅ Alert にエラーメッセージを表示し、`trackPaywallPurchaseFailure` が送信された。 |
| 5 | 復元成功 | `restorePurchases` に同じレシートを渡して復元。 | ✅ `restoredCount=1` で成功。Alert 表示後、ダッシュボードに戻る。 |
| 6 | 復元対象なし | レシートを空にして実行。 | ✅ 「復元できる購入が見つかりませんでした」を表示し、トラッキングイベントは `paywall.restore_failure`。 |
| 7 | Premiumユーザーでアクセス | (2) の後に再度 `/paywall` を開く。 | ✅ Premium 利用中メッセージが表示され、購入ボタンは無効化。 |

## 自動テスト
- `apps/server/tests/integration/iap.test.ts` 追加。`npm run test:integration --workspace apps/server` で IAP レシート処理が成功することを確認。 |

## 補足
- 実機での最終確認時は Apple Sandbox アカウントのログインが必要。共有アカウント情報はチームパスワードマネージャで管理。 |
