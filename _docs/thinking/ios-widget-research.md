# iOS Widget 調査メモ

## Expo での Widget 実装パターン

- Expo 公式では 2024 年現在 `expo-widget` パッケージ（ベータ）と Config Plugin を併用する形が主流。
- マネージドワークフローでも EAS Build を使えば Widget Extension を含めたビルドが可能。
- Bare Workflow に切り替える場合は Xcode で Widget Extension を追加し、`shared` ディレクトリなどに AsyncStorage との共有を行う必要がある。

## 本アプリで想定する構成案

1. **データ供給**: サーバーの `/api/streak` で連続記録日数を返す（今回実装済み）。
2. **モバイル側キャッシュ**: React Query で streak を取得し、`AsyncStorage` に `widget:streak` キーで保存。Widget Extension からは同じ App Group を介して読み取る。
3. **Widget 表示内容**: "🔥 12 days" 形式のテキストと更新日時。小サイズはテキストのみ、中サイズは簡易チャートも検討。
4. **更新タイミング**: - ユーザーが記録した直後に streak を再フェッチし `AsyncStorage` を更新。
   - Widget 側では `TimelineProvider` で 30 分〜1 時間間隔でリロード。

## 実装手順（次フェーズ想定）

1. `expo prebuild` で ios プロジェクトを生成、`expo-widget` を追加。
2. `app.widgets.tsx` を作成し、`Widget.registerWidget` で streak 用ウィジェットを定義。
3. App Group を `ios/MealLogAppWidget/Info.plist` に設定し、`expo-config-plugins` で自動化。
4. Widget 内で `SharedStorage.read('widget:streak')` を使用してキャッシュを読み込む。
5. QA 手順: iOS 15/16/17 で表示確認。データ未取得時のフォールバック文言 "🔥 0 days" を表示。

## 留意点

- Expo Go では Widget をプレビューできないため、Dev Build か EAS Build が必須。
- 実行中のアプリと Widget の間で AsyncStorage を共有するには、`expo-secure-store` ではなく `expo-file-system` または `expo-widget` が提供する `SharedStorage` を使う。
- App Store 審査では Widget の説明スクリーンショットが必要になる。

以上を踏まえ、今回のフェーズでは API とキャッシュ周りまでを整備し、次フェーズで実際の Widget Extension を構築する。
