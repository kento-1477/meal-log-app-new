# Agent メモ

## PR ベースの開発フロー

1. `main` から作業ブランチを作成する: `git switch -c feat/<topic>`
2. 実装・修正を行い、ローカルで品質チェックを通す: `npm run lint && npm test && npm run test:golem`
3. ブランチを push する: `git push -u origin feat/<topic>`
4. GitHub で Pull Request を作成する。
   - タイトル・説明を記入し、`ci-test` と `diff-gate` の結果がグリーンになるまで待つ。
   - CODEOWNERS のレビュアーへリクエストを送る。
5. レビュー指摘を反映し、再度 CI がグリーンになることを確認する。
6. Approve が揃ったら `Squash & merge` で `main` に反映し、Conventional Commits に沿ったメッセージでマージする。
7. マージ後は `main` を pull し、作業ブランチを削除する: `git switch main && git pull && git branch -d feat/<topic>`

## ブランチ保護ルール (GitHub Settings → Branches)

- 対象ブランチ: `main`
- `Require a pull request before merging`
- `Require review from Code Owners`
- `Require status checks to pass before merging` に `ci-test` と `diff-gate`
- `Allow squash merging` のみ許可 (merge commit / rebase merge は禁止)

## CI / 自動化

- `.github/workflows/ci.yml`: lint, test, golem などの品質チェックを実行。
- `.github/workflows/diff-gate.yml`: dual-write 差分チェックを実行。
- Dependabot を有効にし、依存パッケージの更新 PR が作成されるようにしておく。

> 直 push は禁止。必ず PR 経由でレビュー・CI を通すこと。
