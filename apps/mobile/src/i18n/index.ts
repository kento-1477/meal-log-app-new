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
    'recentLogs.addMore': '記録する',
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
    'recentLogs.addMore': 'Log a meal',
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
