# AIレポート VoiceMode / Timezone 仕様

## 1. `voiceMode` 正式仕様

### 1-1. Enum と表示文言
- `gentle`（あまあま）
- `balanced`（真面目）
- `sharp`（激尖り）

### 1-2. ガードレール（禁止/許容）
- 共通禁止:
  - 人格否定、侮辱、恥を煽る表現、脅し
  - 医療断定（診断確定を示す断定）
- `gentle`:
  - 許容: 承認・共感を先頭に置く、改善提案は婉曲に提示
  - 禁止: 強い断定命令調（「必ず」「今すぐやめろ」等）
- `balanced`:
  - 許容: 事実ベースで中立、改善提案を明確に提示
  - 禁止: 過度な煽り・過度な慰めへの偏り
- `sharp`:
  - 許容: 課題の先頭提示、優先順位の明示、行動1位の断定
  - 禁止: 人格攻撃・侮辱語・萎縮させる表現

### 1-3. モード別トーン目標
- `gentle`:
  - 励まし:是正 = 8:2
  - 断定度 = 低
  - 文長 = やや長め（背景説明を含む）
  - 数値強調 = 低〜中
- `balanced`:
  - 励まし:是正 = 6:4
  - 断定度 = 中
  - 文長 = 中
  - 数値強調 = 中
- `sharp`:
  - 励まし:是正 = 3:7
  - 断定度 = 高（ただし人格否定なし）
  - 文長 = 短め（優先順位と行動を明示）
  - 数値強調 = 高

## 2. `adviceStyle` と `voiceMode` の責務分離
- `adviceStyle`:
  - アドバイスの構造と粒度を決める（`simple`/`concrete`/`motivational`）。
- `voiceMode`:
  - 同じ事実・同じ提案を、どの強度/語調で伝えるかを決める（`gentle`/`balanced`/`sharp`）。
- 非機能要件:
  - `voiceMode` が変わっても `score/metrics/comparison` は変えない。

## 3. タイムゾーン仕様

### 3-1. 入力形式
- IANA timezone を使用（例: `America/Los_Angeles`, `Europe/Berlin`）。
- 不正値は正規化してフォールバックへ移行する。

### 3-2. 優先順位
1. request timezone（`POST /api/reports` で確定し `AiReportRequest.timezone` に保存）
2. request header/query timezone（`X-Timezone` / `timezone`）
3. user profile timezone（通知設定の timezone）
4. default timezone（`DASHBOARD_TIMEZONE`）

### 3-3. 一貫性要件
- レポート本体、比較レンジ、streak、dashboard summary の日境界は同一 timezone で計算する。
- DST 境界日でも `from/to` の日付解釈を壊さない。

## 4. 段階リリース仕様
- `REPORT_VOICE_MODE_ENABLED` / `REPORT_REQUEST_TIMEZONE_ENABLED` で機能全体のON/OFFを制御。
- `REPORT_VOICE_MODE_ROLLOUT_PERCENT` / `REPORT_REQUEST_TIMEZONE_ROLLOUT_PERCENT`（0-100）で段階展開を制御。
- ユーザー単位で安定したバケット判定を行い、同一ユーザーで挙動が揺れないことを保証する。
