import { useSyncExternalStore } from 'react';

type Locale = 'ja-JP' | 'en-US';

export const SUPPORTED_LOCALES: readonly Locale[] = ['ja-JP', 'en-US'] as const;
export const DEFAULT_LOCALE: Locale = 'ja-JP';

type TranslationTable = Record<string, string>;

const dictionaries: Record<Locale, TranslationTable> = {
  'ja-JP': {
    'dashboard.title': 'ダッシュボード',
    'dashboard.cacheNotice': 'オフラインのため、保存されたデータを表示しています。',
    'dashboard.requiresLogin': 'ログインが必要です。',
    'dashboard.loginHint': 'チャットタブからログインしてください。',
    'dashboard.loadError': 'データを取得できませんでした。',
    'dashboard.reloadHint': 'スワイプして再読み込みしてください。',
    'dashboard.empty.week': '今週の記録がありません',
    'dashboard.empty.generic': '記録がありません',
    'dashboard.logout': 'ログアウト',
    'dashboard.summary.remainingToday': '残り（今日）',
    'dashboard.summary.periodTotal': '摂取量（期間合計）',
    'button.record': '記録しに行く',
    'period.today': '今日',
    'period.yesterday': '昨日',
    'period.thisWeek': '今週',
    'period.lastWeek': '先週',
    'period.custom': 'カスタム期間',
    'period.previousRange': '前期間',
    'tab.calories': 'カロリー',
    'tab.macros': '主栄養素',
    'tab.nutrients': '栄養素一覧',
    'tab.chat': 'チャット',
    'tab.dashboard': 'ダッシュボード',
    'tab.settings': '設定',
    'macro.protein': 'たんぱく質',
    'macro.fat': '脂質',
    'macro.carbs': '炭水化物',
    'meal.breakfast': '朝食',
    'meal.lunch': '昼食',
    'meal.dinner': '夕食',
    'meal.snack': '間食',
    'meal.unknown': '未分類',
    'comparison.heading': '{{period}}との比較',
    'comparison.current': '現在',
    'comparison.previous': '前期',
    'comparison.target': '目標',
    'comparison.targetShort': '目標',
    'comparison.delta': '差分',
    'comparison.macroDelta': '{{delta}}g',
    'comparison.percentOfTarget': '目標比 {{value}}',
    'status.over': '超過',
    'status.under': '残り',
    'status.onTarget': '目標通り',
    'nutrients.header.nutrient': '栄養素',
    'nutrients.header.total': '合計',
    'nutrients.header.target': '目標',
    'nutrients.header.delta': '+/-',
    'mealDistribution.heading': '時間帯別バランス',
    'mealDistribution.current': '現在',
    'mealDistribution.previous': '前期',
    'mealDistribution.delta': '差',
    'macros.donut.title': 'PFCバランス',
    'macros.donut.legend.current': '現在',
    'remaining.calories': '残りカロリー',
    'remaining.caloriesOver': 'カロリー超過',
    'remaining.left': '{{nutrient}} 残り',
    'remaining.over': '{{nutrient}} 超過',
    'remaining.target': '目標 {{value}}',
    'rings.of_target': '現在 / 目標',
    'rings.left': '{{value}} {{unit}} 残り',
    'rings.over': '{{value}} {{unit}} 超過',
    'rings.no_target': '目標未設定',
    'rings.accessible': '{{label}} {{current}} {{unit}} / {{target}} {{unit}}、{{delta}} {{unit}} {{status}}',
    'rings.accessibleNoTarget': '{{label}} {{current}} {{unit}}、目標未設定',
    'recentLogs.heading': '最近の食事履歴',
    'recentLogs.empty': 'まだ記録がありません。最初の記録を追加しましょう。',
    'recentLogs.resetNotice': '無料プランでは記録が30日ごとにリセットされます。継続して記録を残したい場合は Standard プランをご検討ください。',
    'recentLogs.addMore': '記録する',
    'logs.deleteConfirm.title': '記録を削除しますか？',
    'logs.deleteConfirm.message': '削除すると一覧から非表示になります（元に戻すで復元できます）。',
    'logs.deleted.title': '削除しました',
    'logs.deleted.message': '必要であれば「元に戻す」をタップしてください。',
    'logs.deleted.undo': '元に戻す',
    'logs.deleted.failed': '削除に失敗しました',
    'logs.restore.failed': '復元に失敗しました',
    'logs.restore.success': '履歴を復元しました',
    'common.cancel': 'キャンセル',
    'common.delete': '削除',
    'common.close': '閉じる',
    'usage.limitModal.title': '無料利用上限に達しました',
    'usage.limitModal.message': '無料プランではAIの利用は1日{{limit}}回までです。引き続きご利用いただく場合は Standard プランへの変更をご検討ください。',
    'usage.limitModal.purchase': 'Standard プランに変更',
    'usage.limitModal.close': '閉じる',
    'usage.streakModal.title': '30日連続記録おめでとうございます！',
    'usage.streakModal.message': '無料プランでは30日ごとに記録がリセットされます。引き続きデータを残したい場合は Standard プランをご検討ください。',
    'usage.streakModal.upgrade': 'Standard プランに変更',
    'usage.streakModal.close': 'あとで',
    'usage.purchase.error': '購入に失敗しました',
    'usage.purchase.unsupported': 'このデバイスでは購入できません。App Store対応デバイスでお試しください。',
    'usage.purchase.success': 'クレジットを追加しました',
    'usage.plan.standard': 'Standard プラン',
    'usage.plan.free': '無料プラン',
    'usage.banner.remaining': '残り {{remaining}} / {{limit}} 回',
    'usage.banner.credits': 'クレジット {{credits}} 回分',
    'usage.limitHint': '本日の無料上限に達しました。Standard プランに変更すると記録を続けられます。',
    'export.header.date': '記録日時',
    'export.header.name': '料理名',
    'export.header.calories': 'カロリー(kcal)',
    'export.header.protein': 'たんぱく質(g)',
    'export.header.fat': '脂質(g)',
    'export.header.carbs': '炭水化物(g)',
    'export.title': '食事記録',
    'chat.header': '今日の食事',
    'chart.placeholder.insufficientData': '今日の推移はデータが足りません',
    'streak.days': '日継続中',
    'login.title': 'Meal Log',
    'login.subtitle': '食事を記録して、AI が栄養素を推定します。',
    'login.emailLabel': 'メールアドレス',
    'login.emailPlaceholder': 'example@example.com',
    'login.passwordLabel': 'パスワード',
    'login.passwordPlaceholder': '••••••••',
    'login.submit': 'ログイン',
    'login.error.generic': 'ログインに失敗しました',
    'settings.title': '設定',
    'settings.language.heading': '表示言語',
    'settings.language.changedTitle': '言語を変更しました',
    'settings.language.changedMessage': '一部の画面では再読み込み後に反映されます。',
    'settings.plan.heading': 'ご利用プラン',
    'settings.plan.standard': 'Standard プランをご利用中です。',
    'settings.plan.free': '無料プランをご利用中です。',
    'card.confidence': '信頼度 {{value}}%',
    'card.share': '共有',
    'card.warnings.zeroFloored': 'AIが推定した栄養素の一部が0として返されました。値を確認してください。',
    'card.languageFallback': '※ {{requested}} の翻訳が未対応のため {{resolved}} で表示しています',
    'unit.kcal': 'kcal',
    'unit.gram': 'g',
  },
  'en-US': {
    'dashboard.title': 'Dashboard',
    'dashboard.cacheNotice': 'Offline data shown from cache.',
    'dashboard.requiresLogin': 'Sign-in required.',
    'dashboard.loginHint': 'Please log in from the chat tab.',
    'dashboard.loadError': 'Failed to load data.',
    'dashboard.reloadHint': 'Pull down to refresh.',
    'dashboard.empty.week': 'No logs this week',
    'dashboard.empty.generic': 'No logs yet',
    'dashboard.logout': 'Log out',
    'dashboard.summary.remainingToday': 'Remaining (today)',
    'dashboard.summary.periodTotal': 'Intake (period total)',
    'button.record': 'Log a meal',
    'period.today': 'Today',
    'period.yesterday': 'Yesterday',
    'period.thisWeek': 'This week',
    'period.lastWeek': 'Last week',
    'period.custom': 'Custom period',
    'period.previousRange': 'Previous range',
    'tab.calories': 'Calories',
    'tab.macros': 'Macros',
    'tab.nutrients': 'Nutrients',
    'tab.chat': 'Chat',
    'tab.dashboard': 'Dashboard',
    'tab.settings': 'Settings',
    'macro.protein': 'Protein',
    'macro.fat': 'Fat',
    'macro.carbs': 'Carbs',
    'meal.breakfast': 'Breakfast',
    'meal.lunch': 'Lunch',
    'meal.dinner': 'Dinner',
    'meal.snack': 'Snacks',
    'meal.unknown': 'Unknown',
    'comparison.heading': 'Compared with {{period}}',
    'comparison.current': 'Current',
    'comparison.previous': 'Previous',
    'comparison.target': 'Target',
    'comparison.targetShort': 'Target',
    'comparison.delta': 'Delta',
    'comparison.macroDelta': '{{delta}}g',
    'comparison.percentOfTarget': 'Target ratio {{value}}',
    'status.over': 'Over',
    'status.under': 'Left',
    'status.onTarget': 'On target',
    'nutrients.header.nutrient': 'Nutrient',
    'nutrients.header.total': 'Total',
    'nutrients.header.target': 'Target',
    'nutrients.header.delta': '+/-',
    'mealDistribution.heading': 'Meal balance',
    'mealDistribution.current': 'Current',
    'mealDistribution.previous': 'Previous',
    'mealDistribution.delta': 'Δ',
    'macros.donut.title': 'PFC balance',
    'macros.donut.legend.current': 'Current',
    'remaining.calories': 'Calories left',
    'remaining.caloriesOver': 'Calories over',
    'remaining.left': '{{nutrient}} left',
    'remaining.over': '{{nutrient}} over',
    'remaining.target': 'Target {{value}}',
    'rings.of_target': 'Current / Target',
    'rings.left': '{{value}} {{unit}} left',
    'rings.over': '{{value}} {{unit}} over',
    'rings.no_target': 'No target set',
    'rings.accessible': '{{label}} {{current}} {{unit}} / {{target}} {{unit}}, {{delta}} {{unit}} {{status}}',
    'rings.accessibleNoTarget': '{{label}} {{current}} {{unit}}, target not set',
    'recentLogs.heading': 'Recent meals',
    'recentLogs.empty': 'No meals logged yet. Start tracking your meals!',
    'recentLogs.resetNotice': 'On the free plan, your history resets every 30 days. Switch to the Standard plan to keep all of your records.',
    'recentLogs.addMore': 'Log a meal',
    'logs.deleteConfirm.title': 'Delete this log?',
    'logs.deleteConfirm.message': 'The entry will be removed from the list unless you undo the action.',
    'logs.deleted.title': 'Log deleted',
    'logs.deleted.message': 'Tap Undo if you removed it by mistake.',
    'logs.deleted.undo': 'Undo',
    'logs.deleted.failed': 'Failed to delete the log',
    'logs.restore.failed': 'Failed to restore the log',
    'logs.restore.success': 'Log restored',
    'common.cancel': 'Cancel',
    'common.delete': 'Delete',
    'common.close': 'Close',
    'usage.limitModal.title': 'Free usage limit reached',
    'usage.limitModal.message': 'The free plan allows {{limit}} AI requests per day. Upgrade to the Standard plan to keep logging without waiting.',
    'usage.limitModal.purchase': 'Switch to Standard plan',
    'usage.limitModal.close': 'Close',
    'usage.streakModal.title': 'Congrats on 30 days!',
    'usage.streakModal.message': 'On the free plan, your history resets every 30 days. Stay on track by switching to the Standard plan.',
    'usage.streakModal.upgrade': 'Switch to Standard plan',
    'usage.streakModal.close': 'Later',
    'usage.purchase.error': 'Failed to complete the purchase',
    'usage.purchase.unsupported': 'Purchases are not supported on this device.',
    'usage.purchase.success': 'Credits added to your account',
    'usage.plan.standard': 'Standard plan',
    'usage.plan.free': 'Free plan',
    'usage.banner.remaining': 'Remaining {{remaining}} / {{limit}}',
    'usage.banner.credits': 'Credits {{credits}} left',
    'usage.limitHint': 'You\'ve hit today\'s free limit. Switch to the Standard plan to keep logging.',
    'export.header.date': 'Recorded at',
    'export.header.name': 'Meal',
    'export.header.calories': 'Calories (kcal)',
    'export.header.protein': 'Protein (g)',
    'export.header.fat': 'Fat (g)',
    'export.header.carbs': 'Carbs (g)',
    'export.title': 'Meal Log',
    'chat.header': 'Today\'s meals',
    'chart.placeholder.insufficientData': "Not enough data to show today's trend",
    'streak.days': 'days streak',
    'login.title': 'Meal Log',
    'login.subtitle': 'Log your meals and let AI estimate nutrients.',
    'login.emailLabel': 'Email address',
    'login.emailPlaceholder': 'you@example.com',
    'login.passwordLabel': 'Password',
    'login.passwordPlaceholder': '••••••••',
    'login.submit': 'Sign in',
    'login.error.generic': 'Failed to sign in. Please try again.',
    'settings.title': 'Settings',
    'settings.language.heading': 'Display language',
    'settings.language.changedTitle': 'Language updated',
    'settings.language.changedMessage': 'Some screens may require a refresh to update.',
    'settings.plan.heading': 'Subscription plan',
    'settings.plan.standard': 'You are on the Standard plan.',
    'settings.plan.free': 'You are on the Free plan.',
    'card.confidence': '{{value}}% confidence',
    'card.share': 'Share',
    'card.warnings.zeroFloored': 'Some nutrients were returned as zero. Please double-check them.',
    'card.languageFallback': '※ Showing {{resolved}} because {{requested}} is not translated yet',
    'unit.kcal': 'kcal',
    'unit.gram': 'g',
  },
};

let currentLocale: Locale = DEFAULT_LOCALE;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshot() {
  return currentLocale;
}

function resolveTemplate(template: string, params?: Record<string, string | number>) {
  if (!params) {
    return template;
  }
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key) => {
    const value = params[key];
    return value === undefined ? '' : String(value);
  });
}

function translate(locale: Locale, key: string, params?: Record<string, string | number>) {
  const template = dictionaries[locale][key] ?? dictionaries['ja-JP'][key] ?? key;
  return resolveTemplate(template, params);
}

export function setLocale(locale: Locale) {
  if (locale === currentLocale) {
    return;
  }
  currentLocale = locale;
  emit();
}

export function getLocale() {
  return currentLocale;
}

export function useTranslation() {
  const locale = useSyncExternalStore(subscribe, snapshot, snapshot);
  const t = (key: string, params?: Record<string, string | number>) => translate(locale, key, params);
  return {
    t,
    locale,
    setLocale,
  } as const;
}

export type { Locale };

export function getIntlLocale(locale: Locale = currentLocale) {
  return locale.startsWith('ja') ? 'ja' : 'en';
}
