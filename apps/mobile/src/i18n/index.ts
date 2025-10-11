import { useSyncExternalStore } from 'react';

type Locale = 'ja' | 'en';

type TranslationTable = Record<string, string>;

const dictionaries: Record<Locale, TranslationTable> = {
  ja: {
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
    'comparison.delta': '差分',
    'comparison.deltaPercent': '{{value}}%',
    'comparison.totalDelta': '{{value}}kcal',
    'comparison.percentChange': '{{value}}%',
    'comparison.macroDelta': '{{delta}}g',
    'status.over': '過剰',
    'status.under': '不足',
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
  },
  en: {
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
    'comparison.delta': 'Delta',
    'comparison.deltaPercent': '{{value}}%',
    'comparison.totalDelta': '{{value}}kcal',
    'comparison.percentChange': '{{value}}%',
    'comparison.macroDelta': '{{delta}}g',
    'status.over': 'Above',
    'status.under': 'Below',
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
  },
};

let currentLocale: Locale = 'ja';
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
  const template = dictionaries[locale][key] ?? dictionaries.ja[key] ?? key;
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
