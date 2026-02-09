import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Alert,
  AppState,
  Easing,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient as ExpoLinearGradient } from 'expo-linear-gradient';
import { DateTime } from 'luxon';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AiReportAdvice,
  AiReportComparisonMetric,
  AiReportPreferenceInput,
  AiReportPeriod,
  AiReportResponse,
  AiReportRequestStatus,
  AiReportVoiceMode,
  DashboardPeriod,
  ReportCalendarResponse,
} from '@meal-log/shared';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Sharing from 'expo-sharing';
import { cacheDirectory, deleteAsync, EncodingType, writeAsStringAsync } from 'expo-file-system/legacy';
import Svg, { Circle, Defs, G, LinearGradient, Line, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { arc, area, curveMonotoneX, line } from 'd3-shape';
import { AuroraBackground } from '@/components/AuroraBackground';
import { GlassCard } from '@/components/GlassCard';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useDashboardSummary, type ChartPoint, type MealPeriodBreakdown, type MacroStat } from '@/features/dashboard/useDashboardSummary';
import { ReportSummaryV2, SectionShellV2 } from '@/features/report/report-summary-v2';
import {
  buildReportIdentityLevel,
  buildSummaryEvidenceCards,
  formatGeneratedDate,
  getReportIdentityLabelKey,
} from '@/features/report/report-view-model';
import { resolveReportUiVariant, type ReportUiVariant } from '@/features/report/ui-variant';
import {
  createAiReport,
  getAiReportPreference,
  getAiReportRequest,
  getReportCalendar,
  getStreak,
  listAiReportRequests,
  updateAiReportPreference,
  type ApiError,
} from '@/services/api';
import { REPORT_UI_V2_ENABLED, REPORT_UI_V2_ROLLOUT_PERCENT } from '@/services/config';
import { useTranslation } from '@/i18n';
import { useSessionStore } from '@/store/session';
import { trackEvent } from '@/analytics/track';
import { resolveLogicalDay } from '@/utils/dayBoundary';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { textStyles } from '@/theme/typography';

type ReportCache = Record<string, AiReportResponse>;

const DEFAULT_CACHE: ReportCache = {};

type ReportRange = { from: string; to: string };
type ReportHistoryItem = {
  key: string;
  period: AiReportPeriod;
  range: ReportRange;
  createdAt: string;
  headline: string;
  score: number;
  report: AiReportResponse;
};

type ReportFocusOption = AiReportPreferenceInput['focusAreas'][number];
type ReportAdviceStyleOption = AiReportPreferenceInput['adviceStyle'];
type ReportVoiceModeOption = NonNullable<AiReportPreferenceInput['voiceMode']>;
type ReportScoreEffect = 'celebration' | 'encourage' | 'neutral';
type ReportFeedbackKey = 'too_harsh' | 'not_personalized' | 'date_mismatch';

function formatReportRange(report: AiReportResponse, locale: string) {
  const from = DateTime.fromISO(report.range.from).setZone(report.range.timezone);
  const to = DateTime.fromISO(report.range.to).setZone(report.range.timezone).minus({ days: 1 });
  if (!from.isValid || !to.isValid) {
    return `${report.range.from} - ${report.range.to}`;
  }
  const dateFormat = locale.startsWith('ja') ? 'yyyy/MM/dd' : 'MMM dd, yyyy';
  if (from.hasSame(to, 'day')) {
    return from.toFormat(dateFormat);
  }
  return `${from.toFormat(dateFormat)} - ${to.toFormat(dateFormat)}`;
}

function formatSelectedRange(range: ReportRange, locale: string) {
  const from = DateTime.fromISO(range.from);
  const to = DateTime.fromISO(range.to);
  if (!from.isValid || !to.isValid) {
    return `${range.from} - ${range.to}`;
  }
  const dateFormat = locale.startsWith('ja') ? 'yyyy/MM/dd' : 'MMM dd, yyyy';
  if (from.hasSame(to, 'day')) {
    return from.toFormat(dateFormat);
  }
  return `${from.toFormat(dateFormat)} - ${to.toFormat(dateFormat)}`;
}

function buildReportKey(period: AiReportPeriod, range: ReportRange) {
  return `${period}:${range.from}:${range.to}`;
}

function mapRequestToHistoryItem(request: {
  id: string;
  period: AiReportPeriod;
  range: ReportRange;
  report?: AiReportResponse | null;
  createdAt?: string;
}) {
  if (!request.report) {
    return null;
  }
  const cacheKey = buildReportKey(request.period, request.range);
  return {
    key: cacheKey,
    period: request.period,
    range: request.range,
    createdAt: request.createdAt ?? new Date().toISOString(),
    headline: request.report.summary.headline,
    score: request.report.summary.score,
    report: request.report,
  } satisfies ReportHistoryItem;
}

function toISODateSafe(value: DateTime) {
  return value.toISODate() ?? value.toFormat('yyyy-MM-dd');
}

function buildCalendarRange(month: DateTime, locale: string) {
  const monthStart = month.setLocale(locale).startOf('month');
  const rangeStart = monthStart.startOf('week');
  const rangeEnd = monthStart.endOf('month').endOf('week');
  return {
    from: toISODateSafe(rangeStart),
    to: toISODateSafe(rangeEnd),
  };
}

function buildMonthRange(month: DateTime) {
  const start = month.startOf('month');
  return { from: toISODateSafe(start), to: toISODateSafe(start.endOf('month')) };
}

function formatHistoryDate(value: string, locale: string) {
  const parsed = DateTime.fromISO(value);
  if (!parsed.isValid) {
    return value;
  }
  return parsed.toFormat(locale.startsWith('ja') ? 'yyyy/MM/dd' : 'MMM dd');
}

function weekKeyForDate(dateIso: string, locale: string) {
  return toISODateSafe(DateTime.fromISO(dateIso).setLocale(locale).startOf('week'));
}

function resolveDashboardParams(period: AiReportPeriod, report: AiReportResponse | null) {
  if (!report) {
    const fallback = period === 'weekly' ? 'thisWeek' : 'today';
    return { period: fallback as DashboardPeriod, range: undefined, timezone: undefined };
  }
  const from = DateTime.fromISO(report.range.from).toISODate() ?? report.range.from.slice(0, 10);
  const toDate = DateTime.fromISO(report.range.to).minus({ days: 1 });
  const to = toDate.toISODate() ?? report.range.to.slice(0, 10);
  return { period: 'custom' as DashboardPeriod, range: { from, to }, timezone: report.range.timezone };
}

function scoreEmoji(score: number) {
  if (score >= 85) return '🔥';
  if (score >= 70) return '👍';
  if (score >= 55) return '🌤️';
  return '🌱';
}

function formatComparisonValue(metric: AiReportComparisonMetric) {
  if (metric.unit === 'kcal') {
    return `${Math.round(metric.current)} kcal`;
  }
  if (metric.unit === 'g') {
    return `${Math.round(metric.current * 10) / 10} g`;
  }
  if (metric.unit === '%') {
    return `${Math.round(metric.current)}%`;
  }
  if (metric.unit === 'days') {
    return `${Math.round(metric.current)}`;
  }
  return `${Math.round(metric.current * 10) / 10} ${metric.unit}`.trim();
}

function formatDeltaValue(metric: AiReportComparisonMetric) {
  const sign = metric.delta > 0 ? '+' : metric.delta < 0 ? '-' : '±';
  const absolute = Math.abs(metric.delta);
  if (metric.unit === 'kcal') {
    return `${sign}${Math.round(absolute)} kcal`;
  }
  if (metric.unit === 'g') {
    return `${sign}${Math.round(absolute * 10) / 10} g`;
  }
  if (metric.unit === '%') {
    return `${sign}${Math.round(absolute)}%`;
  }
  if (metric.unit === 'days') {
    return `${sign}${Math.round(absolute)}`;
  }
  return `${sign}${Math.round(absolute * 10) / 10} ${metric.unit}`.trim();
}

function isMetricImproved(metric: AiReportComparisonMetric) {
  if (metric.betterWhen === 'higher') return metric.delta > 0;
  if (metric.betterWhen === 'lower') return metric.delta < 0;
  if (metric.target == null) return Math.abs(metric.delta) < 1;
  const currentDistance = Math.abs(metric.current - metric.target);
  const previousDistance = Math.abs(metric.previous - metric.target);
  return currentDistance < previousDistance;
}

const MACRO_META: Record<MacroStat['key'], { emoji: string; color: string }> = {
  protein_g: { emoji: '🥚', color: colors.ringProtein },
  fat_g: { emoji: '🥑', color: colors.ringFat },
  carbs_g: { emoji: '🍞', color: colors.ringCarb },
};

const MEAL_PERIOD_META: Record<MealPeriodBreakdown['key'], { emoji: string; color: string }> = {
  breakfast: { emoji: '🌅', color: colors.accent },
  lunch: { emoji: '☀️', color: '#FF9B5C' },
  dinner: { emoji: '🌙', color: '#7BA7FF' },
  snack: { emoji: '🍪', color: colors.accentSage },
  unknown: { emoji: '❔', color: colors.border },
};

const HIGHLIGHT_TONES = [colors.accent, colors.accentSage, colors.ringCarb, colors.ringFat];
const REPORT_MIN_LOG_DAYS = {
  daily: 1,
  weekly: 4,
  monthly: 7,
};
const REPORT_HISTORY_LIMIT = 12;
const REPORT_HISTORY_STORAGE_PREFIX = 'meal-log.report-history:';
const REPORT_CALENDAR_CACHE_PREFIX = 'meal-log.report-calendar:';
const REPORT_PENDING_STALE_MS = 1000 * 60 * 10;
const DEFAULT_REPORT_PREFERENCE: AiReportPreferenceInput = {
  goal: 'maintain',
  focusAreas: ['habit'],
  adviceStyle: 'concrete',
  voiceMode: 'balanced',
};
const SHARE_IMAGE_WIDTH = 1080;
const SHARE_IMAGE_HEIGHT = 1350;
const REPORT_FEEDBACK_OPTIONS: ReadonlyArray<{
  key: ReportFeedbackKey;
  labelKey: string;
}> = [
  { key: 'too_harsh', labelKey: 'report.feedback.tooHarsh' },
  { key: 'not_personalized', labelKey: 'report.feedback.notPersonalized' },
  { key: 'date_mismatch', labelKey: 'report.feedback.dateMismatch' },
];

function wrapShareLines(value: string, maxChars: number, maxLines: number) {
  const source = Array.from(value.trim());
  if (!source.length || maxChars <= 0 || maxLines <= 0) {
    return ['-'];
  }
  const lines: string[] = [];
  for (let index = 0; index < source.length && lines.length < maxLines; index += maxChars) {
    lines.push(source.slice(index, index + maxChars).join(''));
  }
  if (source.length > maxChars * maxLines && lines.length) {
    const last = lines.length - 1;
    lines[last] = `${lines[last].slice(0, Math.max(0, maxChars - 1))}…`;
  }
  return lines;
}

function sanitizeShareText(value: string) {
  const normalized = value.normalize('NFKC');
  const withoutControl = Array.from(normalized)
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code >= 0x20 && code !== 0x7f;
    })
    .join('');
  return withoutControl.replace(/[\uFFFD□]/g, '').trim();
}

function highlightTint(index: number) {
  return HIGHLIGHT_TONES[index % HIGHLIGHT_TONES.length];
}

function resolveQuickStatForSection(args: {
  key: 'comparison' | 'trend' | 'macros' | 'mealTiming' | 'metrics' | 'ingredients' | 'advice';
  t: (key: string, values?: Record<string, unknown>) => string;
  report: AiReportResponse;
  summaryStats: {
    averageCalories: number;
    loggedDays: number;
    totalDays: number;
    achievement: number;
  } | null;
  dashboardLoaded: boolean;
  totalCalories: number | null;
}) {
  const { key, t, report, summaryStats, dashboardLoaded, totalCalories } = args;
  if (key === 'comparison') {
    if (typeof report.comparison?.scoreDelta === 'number') {
      const value = report.comparison.scoreDelta > 0 ? `+${report.comparison.scoreDelta}` : `${report.comparison.scoreDelta}`;
      return t('report.section.quick.scoreDelta', { value });
    }
    return t('report.section.quick.noBaseline');
  }
  if (key === 'trend') {
    return summaryStats ? t('report.section.quick.avgKcal', { value: summaryStats.averageCalories }) : t('report.section.quick.loading');
  }
  if (key === 'macros') {
    return dashboardLoaded && typeof totalCalories === 'number'
      ? t('report.section.quick.totalKcal', { value: Math.round(totalCalories) })
      : t('report.section.quick.loading');
  }
  if (key === 'mealTiming') {
    return summaryStats ? t('report.section.quick.loggedDaysShort', { value: summaryStats.loggedDays }) : t('report.section.quick.loading');
  }
  if (key === 'metrics') {
    return t('report.section.quick.metricCount', { value: report.metrics.length });
  }
  if (key === 'ingredients') {
    return t('report.section.quick.itemCount', { value: report.ingredients.length });
  }
  return t('report.section.quick.itemCount', { value: report.advice.length });
}

export default function ReportScreen() {
  const { t, locale } = useTranslation();
  const { width: viewportWidth } = useWindowDimensions();
  const setUsage = useSessionStore((state) => state.setUsage);
  const userId = useSessionStore((state) => state.user?.id ?? null);
  const queryClient = useQueryClient();
  const today = useMemo(() => resolveLogicalDay(), []);
  const initialDate = useMemo(() => toISODateSafe(today), [today]);
  const initialMonth = useMemo(() => toISODateSafe(today.startOf('month')), [today]);
  const [period, setPeriod] = useState<AiReportPeriod>('daily');
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const [activeRequestStatus, setActiveRequestStatus] = useState<AiReportRequestStatus | null>(null);
  const [activeRequestRange, setActiveRequestRange] = useState<ReportRange | null>(null);
  const [activeRequestPeriod, setActiveRequestPeriod] = useState<AiReportPeriod | null>(null);
  const lastRequestStatusRef = useRef<string | null>(null);
  const [reports, setReports] = useState<ReportCache>(DEFAULT_CACHE);
  const [reportHistory, setReportHistory] = useState<ReportHistoryItem[]>([]);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [showPreferenceModal, setShowPreferenceModal] = useState(false);
  const [draftPreference, setDraftPreference] = useState<AiReportPreferenceInput>(DEFAULT_REPORT_PREFERENCE);
  const [scoreEffect, setScoreEffect] = useState<ReportScoreEffect | null>(null);
  const [scoreEffectMessage, setScoreEffectMessage] = useState('');
  const [submittedFeedback, setSubmittedFeedback] = useState<Record<ReportFeedbackKey, boolean>>({
    too_harsh: false,
    not_personalized: false,
    date_mismatch: false,
  });
  const scoreEffectOpacity = useRef(new Animated.Value(0)).current;
  const playedEffectReportKeyRef = useRef<string | null>(null);
  const trackedReportCompletionRef = useRef<Set<string>>(new Set());
  const trackedVariantExposureRef = useRef<Set<string>>(new Set());
  const pendingGenerateRef = useRef<{ period: AiReportPeriod; range: ReportRange } | null>(null);
  const shareSvgRef = useRef<React.ComponentRef<typeof Svg> | null>(null);
  const historyStorageKey = useMemo(
    () => (userId ? `${REPORT_HISTORY_STORAGE_PREFIX}${userId}` : null),
    [userId],
  );
  const [dailySelected, setDailySelected] = useState<string | null>(initialDate);
  const [weeklySelected, setWeeklySelected] = useState<string | null>(initialDate);
  const [monthlyYear, setMonthlyYear] = useState(today.year);
  const [monthlyMonth, setMonthlyMonth] = useState(today.month);
  const [dailyViewMonth, setDailyViewMonth] = useState(initialMonth);
  const [weeklyViewMonth, setWeeklyViewMonth] = useState(initialMonth);
  const calendarViewMonth = period === 'weekly' ? weeklyViewMonth : dailyViewMonth;
  const calendarViewDate = useMemo(() => DateTime.fromISO(calendarViewMonth), [calendarViewMonth]);
  const calendarRange = useMemo(() => {
    if (period === 'monthly') {
      return null;
    }
    return buildCalendarRange(calendarViewDate, locale);
  }, [calendarViewDate, locale, period]);
  const calendarQueryKey = useMemo(
    () =>
      calendarRange
        ? ['reportCalendar', userId ?? 'anon', calendarRange.from, calendarRange.to]
        : ['reportCalendar', 'none'],
    [calendarRange, userId],
  );
  const calendarCacheKey = useMemo(
    () =>
      calendarRange && userId
        ? `${REPORT_CALENDAR_CACHE_PREFIX}${userId}:${calendarRange.from}:${calendarRange.to}`
        : null,
    [calendarRange, userId],
  );
  const [calendarSnapshot, setCalendarSnapshot] = useState<ReportCalendarResponse | null>(null);
  const preferenceQuery = useQuery({
    queryKey: ['reportPreference', userId ?? 'anon'],
    queryFn: () => getAiReportPreference(),
    enabled: Boolean(userId),
    staleTime: 1000 * 60 * 10,
    onSuccess: (data) => {
      setDraftPreference(data.preference);
    },
  });
  const streakQuery = useQuery({
    queryKey: ['streak', userId ?? 'anon'],
    queryFn: () => getStreak(),
    enabled: Boolean(userId),
    staleTime: 1000 * 60,
  });
  const calendarSummary = useQuery({
    queryKey: calendarQueryKey,
    queryFn: () => {
      if (!calendarRange) {
        throw new Error('Missing calendar range');
      }
      return getReportCalendar(calendarRange);
    },
    enabled: Boolean(calendarRange),
    staleTime: 1000 * 60 * 5,
    onSuccess: (data) => {
      if (calendarCacheKey) {
        AsyncStorage.setItem(calendarCacheKey, JSON.stringify(data)).catch((error) => {
          console.warn('Failed to cache report calendar', error);
        });
      }
    },
  });
  const calendarData = calendarSummary.data ?? calendarSnapshot;
  useEffect(() => {
    if (!calendarSummary.data) {
      return;
    }
    setCalendarSnapshot(calendarSummary.data);
  }, [calendarSummary.data]);
  useEffect(() => {
    let active = true;
    if (!calendarCacheKey) {
      if (!calendarSummary.data) {
        setCalendarSnapshot(null);
      }
      return () => {
        active = false;
      };
    }
    AsyncStorage.getItem(calendarCacheKey)
      .then((value) => {
        if (!active || !value) return;
        try {
          const parsed = JSON.parse(value) as ReportCalendarResponse;
          queryClient.setQueryData(calendarQueryKey, parsed);
          setCalendarSnapshot(parsed);
        } catch (error) {
          console.warn('Failed to parse cached report calendar', error);
        }
      })
      .catch((error) => {
        console.warn('Failed to load cached report calendar', error);
      });
    return () => {
      active = false;
    };
  }, [calendarCacheKey, calendarQueryKey, calendarSummary.data, queryClient]);
  const recordedDayList = useMemo(() => {
    if (!calendarData) {
      return [];
    }
    return calendarData.days.filter((day) => day.count > 0).map((day) => day.date);
  }, [calendarData]);

  useEffect(() => {
    if (period === 'monthly') {
      return;
    }
    const prevRange = buildCalendarRange(calendarViewDate.minus({ months: 1 }), locale);
    const nextRange = buildCalendarRange(calendarViewDate.plus({ months: 1 }), locale);
    [prevRange, nextRange].forEach((range) => {
      queryClient.prefetchQuery({
        queryKey: ['reportCalendar', userId ?? 'anon', range.from, range.to],
        queryFn: () => getReportCalendar(range),
        staleTime: 1000 * 60 * 5,
      });
    });
  }, [calendarViewDate, locale, period, queryClient, userId]);
  const recordedDays = useMemo(() => new Set(recordedDayList), [recordedDayList]);
  const hasRecordedDays = recordedDayList.length > 0;
  const weeklyLogCounts = useMemo(() => {
    const map = new Map<string, number>();
    recordedDayList.forEach((date) => {
      const key = weekKeyForDate(date, locale);
      map.set(key, (map.get(key) ?? 0) + 1);
    });
    return map;
  }, [locale, recordedDayList]);
  const weeklyEligibleDates = useMemo(
    () =>
      recordedDayList.filter(
        (date) => (weeklyLogCounts.get(weekKeyForDate(date, locale)) ?? 0) >= REPORT_MIN_LOG_DAYS.weekly,
      ),
    [locale, recordedDayList, weeklyLogCounts],
  );
  const hasEligibleWeeks = weeklyEligibleDates.length > 0;

  const trackReportCompletion = useCallback(
    (request: { id: string; status: AiReportRequestStatus; report?: AiReportResponse | null; errorCode?: string | null }) => {
      if (!(request.status === 'done' || request.status === 'failed' || request.status === 'canceled')) {
        return;
      }
      const completionKey = `${request.id}:${request.status}`;
      if (trackedReportCompletionRef.current.has(completionKey)) {
        return;
      }
      trackedReportCompletionRef.current.add(completionKey);
      trackEvent('report.generate_completed', {
        requestId: request.id,
        status: request.status,
        uiVariant,
        score: request.status === 'done' ? Math.round(request.report?.summary.score ?? 0) : undefined,
        voiceMode: request.report?.meta?.voiceModeApplied ?? request.report?.preference?.voiceMode ?? 'balanced',
        voiceModeApplied: request.report?.meta?.voiceModeApplied ?? undefined,
        model: request.report?.meta?.model ?? undefined,
        generationPath: request.report?.meta?.generationPath ?? undefined,
        fallbackReason: request.report?.meta?.fallbackReason ?? undefined,
        fallbackModelUsed: request.report?.meta?.fallback_model_used ?? undefined,
        latencyMs: request.report?.meta?.latencyMs ?? undefined,
        errorCode: request.errorCode ?? undefined,
      });
    },
    [uiVariant],
  );

  useQuery({
    queryKey: ['reportRequests', userId ?? 'anon'],
    queryFn: () => listAiReportRequests({ limit: REPORT_HISTORY_LIMIT }),
    enabled: Boolean(userId),
    refetchInterval: activeRequestId ? 3000 : false,
    onSuccess: (data) => {
      const activeItem = activeRequestId ? data.items.find((item) => item.id === activeRequestId) ?? null : null;
      if (activeItem) {
        setActiveRequestStatus((prev) => (prev === activeItem.status ? prev : activeItem.status));
        setActiveRequestRange((prev) =>
          prev && prev.from === activeItem.range.from && prev.to === activeItem.range.to
            ? prev
            : { from: activeItem.range.from, to: activeItem.range.to },
        );
        setActiveRequestPeriod((prev) => (prev === activeItem.period ? prev : activeItem.period));

        if (activeItem.status === 'done' && activeItem.report) {
          trackReportCompletion({
            id: activeItem.id,
            status: activeItem.status,
            report: activeItem.report,
            errorCode: activeItem.errorCode,
          });
          const cacheKey = buildReportKey(activeItem.period, {
            from: activeItem.range.from,
            to: activeItem.range.to,
          });
          setReports((prev) => ({ ...prev, [cacheKey]: activeItem.report! }));
          const historyItem = mapRequestToHistoryItem({
            id: activeItem.id,
            period: activeItem.period,
            range: { from: activeItem.range.from, to: activeItem.range.to },
            report: activeItem.report ?? null,
            createdAt: activeItem.createdAt,
          });
          if (historyItem) {
            setReportHistory((prev) => {
              const next = [historyItem, ...prev.filter((entry) => entry.key !== cacheKey)].slice(0, REPORT_HISTORY_LIMIT);
              if (historyStorageKey) {
                AsyncStorage.setItem(historyStorageKey, JSON.stringify(next)).catch((error) => {
                  console.warn('Failed to persist report history', error);
                });
              }
              return next;
            });
          }
          if (activeItem.usage) {
            setUsage(activeItem.usage);
          }
          lastRequestStatusRef.current = `${activeItem.id}:${activeItem.status}`;
          setActiveRequestId(null);
        } else if (activeItem.status === 'failed') {
          trackReportCompletion({
            id: activeItem.id,
            status: activeItem.status,
            report: activeItem.report,
            errorCode: activeItem.errorCode,
          });
          Alert.alert(t('report.errorTitle'), activeItem.errorMessage ?? t('report.errorFallback'));
          setActiveRequestId(null);
        } else if (activeItem.status === 'canceled') {
          trackReportCompletion({
            id: activeItem.id,
            status: activeItem.status,
            report: activeItem.report,
            errorCode: activeItem.errorCode,
          });
          Alert.alert(t('report.errorTitle'), t('report.canceledMessage'));
          setActiveRequestId(null);
        }
      }

      const nowMs = Date.now();
      const pending = data.items.find((item) => {
        if (!(item.status === 'processing' || item.status === 'queued')) {
          return false;
        }
        const updatedAtMs = DateTime.fromISO(item.updatedAt ?? item.createdAt ?? '').toMillis();
        if (!Number.isFinite(updatedAtMs)) {
          return false;
        }
        return nowMs - updatedAtMs <= REPORT_PENDING_STALE_MS;
      }) ?? null;
      if (!activeRequestId) {
        if (pending) {
          setActiveRequestId(pending.id);
          setActiveRequestStatus(pending.status);
          setActiveRequestRange({ from: pending.range.from, to: pending.range.to });
          setActiveRequestPeriod(pending.period);
        } else {
          setActiveRequestStatus(null);
          setActiveRequestRange(null);
          setActiveRequestPeriod(null);
        }
      }

      const historyItems = data.items
        .map((item) =>
          mapRequestToHistoryItem({
            id: item.id,
            period: item.period,
            range: { from: item.range.from, to: item.range.to },
            report: item.report ?? null,
            createdAt: item.createdAt,
          }),
        )
        .filter((item): item is ReportHistoryItem => Boolean(item));

      if (historyItems.length) {
        setReportHistory(historyItems);
        setReports((prev) => {
          const next = { ...prev };
          historyItems.forEach((item) => {
            next[item.key] = item.report;
          });
          return next;
        });
        if (historyStorageKey) {
          AsyncStorage.setItem(historyStorageKey, JSON.stringify(historyItems)).catch((error) => {
            console.warn('Failed to persist report history', error);
          });
        }
      }
    },
    onError: (error) => {
      console.error('Failed to load report requests', error);
    },
  });

  const reportRequestQuery = useQuery({
    queryKey: ['reportRequest', activeRequestId ?? 'none'],
    queryFn: () => getAiReportRequest(activeRequestId ?? ''),
    enabled: Boolean(activeRequestId),
    refetchInterval: (data) => {
      const status = data?.request?.status;
      return status === 'queued' || status === 'processing' ? 3000 : false;
    },
    onError: (error) => {
      console.error('Failed to load report request status', error);
    },
  });

  useEffect(() => {
    const request = reportRequestQuery.data?.request;
    if (!request) {
      return;
    }
    setActiveRequestStatus((prev) => (prev === request.status ? prev : request.status));
    setActiveRequestRange((prev) =>
      prev && prev.from === request.range.from && prev.to === request.range.to
        ? prev
        : { from: request.range.from, to: request.range.to },
    );
    setActiveRequestPeriod((prev) => (prev === request.period ? prev : request.period));

    const statusKey = `${request.id}:${request.status}`;
    if (statusKey === lastRequestStatusRef.current) {
      return;
    }
    lastRequestStatusRef.current = statusKey;

    if (request.status === 'done' && request.report) {
      trackReportCompletion({
        id: request.id,
        status: request.status,
        report: request.report,
        errorCode: request.errorCode,
      });
      const cacheKey = buildReportKey(request.period, {
        from: request.range.from,
        to: request.range.to,
      });
      setReports((prev) => ({ ...prev, [cacheKey]: request.report! }));
      const historyItem = mapRequestToHistoryItem({
        id: request.id,
        period: request.period,
        range: { from: request.range.from, to: request.range.to },
        report: request.report ?? null,
        createdAt: request.createdAt,
      });
      if (historyItem) {
        setReportHistory((prev) => {
          const next = [historyItem, ...prev.filter((entry) => entry.key !== cacheKey)].slice(0, REPORT_HISTORY_LIMIT);
          if (historyStorageKey) {
            AsyncStorage.setItem(historyStorageKey, JSON.stringify(next)).catch((error) => {
              console.warn('Failed to persist report history', error);
            });
          }
          return next;
        });
      }
      if (request.usage) {
        setUsage(request.usage);
      }
      setActiveRequestId(null);
      return;
    }

    if (request.status === 'failed') {
      trackReportCompletion({
        id: request.id,
        status: request.status,
        report: request.report,
        errorCode: request.errorCode,
      });
      Alert.alert(t('report.errorTitle'), request.errorMessage ?? t('report.errorFallback'));
      setActiveRequestId(null);
      return;
    }

    if (request.status === 'canceled') {
      trackReportCompletion({
        id: request.id,
        status: request.status,
        report: request.report,
        errorCode: request.errorCode,
      });
      Alert.alert(t('report.errorTitle'), t('report.canceledMessage'));
      setActiveRequestId(null);
    }
  }, [historyStorageKey, reportRequestQuery.data, setUsage, t, trackReportCompletion]);

  useEffect(() => {
    if (!activeRequestPeriod || !activeRequestRange) {
      return;
    }
    setPeriod(activeRequestPeriod);
    if (activeRequestPeriod === 'daily') {
      setDailySelected(activeRequestRange.from);
      setDailyViewMonth(toISODateSafe(DateTime.fromISO(activeRequestRange.from).startOf('month')));
      return;
    }
    if (activeRequestPeriod === 'weekly') {
      setWeeklySelected(activeRequestRange.from);
      setWeeklyViewMonth(toISODateSafe(DateTime.fromISO(activeRequestRange.from).startOf('month')));
      return;
    }
    const start = DateTime.fromISO(activeRequestRange.from);
    if (start.isValid) {
      setMonthlyYear(start.year);
      setMonthlyMonth(start.month);
    }
  }, [activeRequestPeriod, activeRequestRange]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && activeRequestId) {
        reportRequestQuery.refetch();
      }
    });
    return () => {
      subscription.remove();
    };
  }, [activeRequestId, reportRequestQuery]);

  useEffect(() => {
    let active = true;
    if (!historyStorageKey) {
      setReportHistory([]);
      return () => {
        active = false;
      };
    }
    AsyncStorage.getItem(historyStorageKey)
      .then((value) => {
        if (!active) return;
        if (!value) {
          setReportHistory([]);
          return;
        }
        try {
          const parsed = JSON.parse(value) as ReportHistoryItem[];
          setReportHistory(Array.isArray(parsed) ? parsed : []);
        } catch (error) {
          console.warn('Failed to parse report history', error);
          setReportHistory([]);
        }
      })
      .catch((error) => {
        console.warn('Failed to load report history', error);
      });
    return () => {
      active = false;
    };
  }, [historyStorageKey]);

  useEffect(() => {
    if (period !== 'daily' || !calendarSummary.data) {
      return;
    }
    if (!hasRecordedDays) {
      setDailySelected(null);
      return;
    }
    if (!dailySelected || !recordedDays.has(dailySelected)) {
      setDailySelected(recordedDayList[recordedDayList.length - 1]);
    }
  }, [calendarSummary.data, dailySelected, hasRecordedDays, period, recordedDayList, recordedDays]);

  useEffect(() => {
    if (period !== 'weekly' || !calendarSummary.data) {
      return;
    }
    if (!hasEligibleWeeks) {
      setWeeklySelected(null);
      return;
    }
    const isSelectedEligible = weeklySelected
      ? (weeklyLogCounts.get(weekKeyForDate(weeklySelected, locale)) ?? 0) >= REPORT_MIN_LOG_DAYS.weekly
      : false;
    if (!weeklySelected || !isSelectedEligible) {
      setWeeklySelected(weeklyEligibleDates[weeklyEligibleDates.length - 1]);
    }
  }, [calendarSummary.data, hasEligibleWeeks, locale, period, weeklyEligibleDates, weeklyLogCounts, weeklySelected]);

  const monthlyRange = useMemo(() => {
    const monthStart = DateTime.fromObject({ year: monthlyYear, month: monthlyMonth, day: 1 });
    return buildMonthRange(monthStart);
  }, [monthlyMonth, monthlyYear]);
  const selectedRange = useMemo(() => {
    if (period === 'daily') {
      if (!dailySelected) return null;
      const dailyRange = { from: dailySelected, to: dailySelected };
      const dailyKey = buildReportKey('daily', dailyRange);
      if (!recordedDays.has(dailySelected) && !reports[dailyKey]) return null;
      return dailyRange;
    }
    if (period === 'weekly') {
      if (!weeklySelected) return null;
      const weekKey = weekKeyForDate(weeklySelected, locale);
      const weekCount = weeklyLogCounts.get(weekKey) ?? 0;
      const anchor = DateTime.fromISO(weeklySelected).setLocale(locale);
      const start = anchor.startOf('week');
      const end = start.plus({ days: 6 });
      const weeklyRange = { from: toISODateSafe(start), to: toISODateSafe(end) };
      const weeklyKey = buildReportKey('weekly', weeklyRange);
      if (weekCount < REPORT_MIN_LOG_DAYS.weekly && !reports[weeklyKey]) return null;
      return weeklyRange;
    }
    return monthlyRange;
  }, [dailySelected, locale, monthlyRange, period, recordedDays, reports, weeklyLogCounts, weeklySelected]);
  const monthlyCacheKey = useMemo(
    () =>
      userId ? `${REPORT_CALENDAR_CACHE_PREFIX}${userId}:${monthlyRange.from}:${monthlyRange.to}` : null,
    [monthlyRange, userId],
  );
  const [monthlySnapshot, setMonthlySnapshot] = useState<ReportCalendarResponse | null>(null);
  const monthlySummary = useQuery({
    queryKey: ['reportCalendar', userId ?? 'anon', monthlyRange.from, monthlyRange.to],
    queryFn: () => getReportCalendar(monthlyRange),
    enabled: period === 'monthly',
    staleTime: 1000 * 60 * 5,
    onSuccess: (data) => {
      if (monthlyCacheKey) {
        AsyncStorage.setItem(monthlyCacheKey, JSON.stringify(data)).catch((error) => {
          console.warn('Failed to cache monthly report calendar', error);
        });
      }
    },
  });
  useEffect(() => {
    if (!monthlySummary.data) {
      return;
    }
    setMonthlySnapshot(monthlySummary.data);
  }, [monthlySummary.data]);
  useEffect(() => {
    let active = true;
    if (!monthlyCacheKey) {
      if (!monthlySummary.data) {
        setMonthlySnapshot(null);
      }
      return () => {
        active = false;
      };
    }
    AsyncStorage.getItem(monthlyCacheKey)
      .then((value) => {
        if (!active || !value) return;
        try {
          const parsed = JSON.parse(value) as ReportCalendarResponse;
          queryClient.setQueryData(['reportCalendar', userId ?? 'anon', monthlyRange.from, monthlyRange.to], parsed);
          setMonthlySnapshot(parsed);
        } catch (error) {
          console.warn('Failed to parse cached monthly report calendar', error);
        }
      })
      .catch((error) => {
        console.warn('Failed to load cached monthly report calendar', error);
      });
    return () => {
      active = false;
    };
  }, [monthlyCacheKey, monthlyRange.from, monthlyRange.to, monthlySummary.data, queryClient, userId]);
  const monthlyData = monthlySummary.data ?? monthlySnapshot;
  const selectedTimezone = period === 'monthly' ? monthlyData?.range.timezone : calendarData?.range.timezone;
  const monthlyLoggedDays = useMemo(() => monthlyData?.days.length ?? 0, [monthlyData]);
  const monthlyEligible = monthlyLoggedDays >= REPORT_MIN_LOG_DAYS.monthly;
  const dailyEligible = dailySelected ? recordedDays.has(dailySelected) : false;
  const weeklyEligible = weeklySelected
    ? (weeklyLogCounts.get(weekKeyForDate(weeklySelected, locale)) ?? 0) >= REPORT_MIN_LOG_DAYS.weekly
    : false;
  const reportKey = useMemo(
    () => (selectedRange ? buildReportKey(period, selectedRange) : null),
    [period, selectedRange],
  );
  const report = reportKey ? reports[reportKey] ?? null : null;
  const dashboardParams = useMemo(() => resolveDashboardParams(period, report), [period, report]);
  const dashboardSummary = useDashboardSummary(dashboardParams.period, {
    enabled: Boolean(report),
    range: dashboardParams.range,
    timezone: dashboardParams.timezone,
  });
  const dashboard = dashboardSummary.data;

  const summaryStats = useMemo(() => {
    if (!dashboard) {
      return null;
    }
    const dailyEntries = dashboard.summary.calories.daily;
    const loggedDays = dailyEntries.filter((entry) => entry.total > 0).length;
    const totalDays = dailyEntries.length;
    const totalCalories = dailyEntries.reduce((sum, entry) => sum + entry.total, 0);
    const averageCalories = loggedDays > 0 ? Math.round(totalCalories / loggedDays) : 0;
    const targetCalories = dashboard.summary.macros.targets.calories;
    const achievement = targetCalories > 0 ? Math.round((dashboard.summary.macros.total.calories / targetCalories) * 100) : 0;
    return {
      averageCalories,
      loggedDays,
      totalDays,
      achievement,
    };
  }, [dashboard]);
  const streakDays = report?.uiMeta?.streakDays ?? streakQuery.data?.streak.current ?? 0;
  const sectionQuickStats = useMemo(() => {
    if (!report) {
      return null;
    }
    const totalCalories = dashboard ? dashboard.summary.macros.total.calories : null;
    return {
      comparison: resolveQuickStatForSection({ key: 'comparison', t, report, summaryStats, dashboardLoaded: Boolean(dashboard), totalCalories }),
      trend: resolveQuickStatForSection({ key: 'trend', t, report, summaryStats, dashboardLoaded: Boolean(dashboard), totalCalories }),
      macros: resolveQuickStatForSection({ key: 'macros', t, report, summaryStats, dashboardLoaded: Boolean(dashboard), totalCalories }),
      mealTiming: resolveQuickStatForSection({ key: 'mealTiming', t, report, summaryStats, dashboardLoaded: Boolean(dashboard), totalCalories }),
      metrics: resolveQuickStatForSection({ key: 'metrics', t, report, summaryStats, dashboardLoaded: Boolean(dashboard), totalCalories }),
      ingredients: resolveQuickStatForSection({ key: 'ingredients', t, report, summaryStats, dashboardLoaded: Boolean(dashboard), totalCalories }),
      advice: resolveQuickStatForSection({ key: 'advice', t, report, summaryStats, dashboardLoaded: Boolean(dashboard), totalCalories }),
    };
  }, [dashboard, report, summaryStats, t]);
  const showWeeklyPrompt = period === 'daily' && streakDays >= 7;

  useEffect(() => {
    setDetailsExpanded(false);
    setSubmittedFeedback({
      too_harsh: false,
      not_personalized: false,
      date_mismatch: false,
    });
  }, [reportKey]);

  useEffect(() => {
    if (!report || !reportKey) {
      return;
    }
    if (playedEffectReportKeyRef.current === reportKey) {
      return;
    }
    const resolvedEffect: ReportScoreEffect =
      report.uiMeta?.effect ??
      (report.summary.score >= 85 ? 'celebration' : report.summary.score <= 45 ? 'encourage' : 'neutral');
    if (resolvedEffect === 'neutral') {
      playedEffectReportKeyRef.current = reportKey;
      return;
    }

    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduceMotion) => {
        if (!active || reduceMotion) {
          playedEffectReportKeyRef.current = reportKey;
          return;
        }
        const message =
          resolvedEffect === 'celebration'
            ? t('report.effect.celebration')
            : t('report.effect.encourage');
        setScoreEffect(resolvedEffect);
        setScoreEffectMessage(message);
        scoreEffectOpacity.setValue(0);
        Animated.sequence([
          Animated.timing(scoreEffectOpacity, {
            toValue: 1,
            duration: 220,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.delay(1300),
          Animated.timing(scoreEffectOpacity, {
            toValue: 0,
            duration: 260,
            easing: Easing.in(Easing.cubic),
            useNativeDriver: true,
          }),
        ]).start(() => {
          setScoreEffect(null);
          playedEffectReportKeyRef.current = reportKey;
        });
      })
      .catch(() => {
        playedEffectReportKeyRef.current = reportKey;
      });

    return () => {
      active = false;
    };
  }, [report, reportKey, scoreEffectOpacity, t]);

  const periodOptions = useMemo(
    () => [
      { key: 'daily' as const, label: t('report.period.daily') },
      { key: 'weekly' as const, label: t('report.period.weekly') },
      { key: 'monthly' as const, label: t('report.period.monthly') },
    ],
    [t],
  );
  const periodHints = useMemo(
    () => ({
      daily: t('report.periodHint.daily'),
      weekly: t('report.periodHint.weekly'),
      monthly: t('report.periodHint.monthly'),
    }),
    [t],
  );
  const preferenceConfigured = preferenceQuery.data?.configured ?? false;
  const activePreference = preferenceQuery.data?.preference ?? draftPreference;
  const voiceModeOptions: ReportVoiceModeOption[] = ['gentle', 'balanced', 'sharp'];
  const activeVoiceMode = activePreference.voiceMode ?? 'balanced';
  const uiVariantResult = useMemo(
    () =>
      resolveReportUiVariant({
        userId,
        enabled: REPORT_UI_V2_ENABLED,
        rolloutPercent: REPORT_UI_V2_ROLLOUT_PERCENT,
      }),
    [userId],
  );
  const uiVariant: ReportUiVariant = uiVariantResult.variant;
  const isSmartPro = uiVariant === 'v2-smart-pro';
  const compactLayout = viewportWidth < 375;
  useEffect(() => {
    const exposureKey = `${uiVariant}:${period}:${activeVoiceMode}`;
    if (trackedVariantExposureRef.current.has(exposureKey)) {
      return;
    }
    trackedVariantExposureRef.current.add(exposureKey);
    trackEvent('report.ui_variant_exposed', {
      variant: uiVariant,
      userBucket: uiVariantResult.userBucket ?? undefined,
      voiceMode: activeVoiceMode,
      period,
    });
  }, [activeVoiceMode, period, uiVariant, uiVariantResult.userBucket]);

  const updatePreferenceMutation = useMutation({
    mutationFn: (payload: AiReportPreferenceInput) => updateAiReportPreference(payload),
    onSuccess: (response) => {
      setDraftPreference(response.preference);
      queryClient.setQueryData(['reportPreference', userId ?? 'anon'], {
        ok: true,
        preference: response.preference,
        configured: true,
      });
      trackEvent('report.preference_saved', {
        goal: response.preference.goal,
        focusAreas: response.preference.focusAreas,
        adviceStyle: response.preference.adviceStyle,
        voiceMode: response.preference.voiceMode ?? 'balanced',
      });
      setShowPreferenceModal(false);
      const pending = pendingGenerateRef.current;
      if (pending) {
        pendingGenerateRef.current = null;
        createReportMutation.mutate({
          period: pending.period,
          range: pending.range,
          preferenceOverride: response.preference,
        });
      }
    },
    onError: (error) => {
      const apiError = error as ApiError;
      Alert.alert(t('report.errorTitle'), apiError?.message ?? t('report.errorFallback'));
    },
  });
  const handleQuickVoiceModeChange = useCallback(
    (mode: ReportVoiceModeOption) => {
      if (mode === activeVoiceMode || updatePreferenceMutation.isLoading) {
        return;
      }
      trackEvent('report.voice_mode_switched', {
        from: activeVoiceMode,
        to: mode,
        source: 'report.preference.card',
      });
      const nextPreference = { ...activePreference, voiceMode: mode };
      setDraftPreference(nextPreference);
      updatePreferenceMutation.mutate(nextPreference);
    },
    [activePreference, activeVoiceMode, updatePreferenceMutation],
  );
  const createReportMutation = useMutation({
    mutationFn: (payload: {
      period: AiReportPeriod;
      range: { from: string; to: string };
      preferenceOverride: AiReportPreferenceInput;
    }) => createAiReport(payload.period, payload.range, payload.preferenceOverride),
    onSuccess: (response, payload) => {
      setActiveRequestId(response.requestId);
      setActiveRequestStatus(response.status);
      setActiveRequestRange(payload.range);
      setActiveRequestPeriod(payload.period);
      lastRequestStatusRef.current = null;
      queryClient.invalidateQueries({ queryKey: ['reportRequests', userId ?? 'anon'] }).catch(() => {
        // no-op
      });
      if (response.status === 'done') {
        getAiReportRequest(response.requestId)
          .then((result) => {
            const doneRequest = result.request;
            if (doneRequest.status !== 'done' || !doneRequest.report) {
              return;
            }
            trackReportCompletion({
              id: doneRequest.id,
              status: doneRequest.status,
              report: doneRequest.report,
              errorCode: doneRequest.errorCode,
            });
            const cacheKey = buildReportKey(doneRequest.period, {
              from: doneRequest.range.from,
              to: doneRequest.range.to,
            });
            setReports((prev) => ({ ...prev, [cacheKey]: doneRequest.report! }));
            const historyItem = mapRequestToHistoryItem({
              id: doneRequest.id,
              period: doneRequest.period,
              range: { from: doneRequest.range.from, to: doneRequest.range.to },
              report: doneRequest.report ?? null,
              createdAt: doneRequest.createdAt,
            });
            if (historyItem) {
              setReportHistory((prev) => {
                const next = [historyItem, ...prev.filter((entry) => entry.key !== cacheKey)].slice(0, REPORT_HISTORY_LIMIT);
                if (historyStorageKey) {
                  AsyncStorage.setItem(historyStorageKey, JSON.stringify(next)).catch((error) => {
                    console.warn('Failed to persist report history', error);
                  });
                }
                return next;
              });
            }
            if (doneRequest.usage) {
              setUsage(doneRequest.usage);
            }
            lastRequestStatusRef.current = `${doneRequest.id}:${doneRequest.status}`;
            setActiveRequestId(null);
          })
          .catch((error) => {
            console.error('Failed to hydrate immediate done report', error);
          });
      }
    },
    onError: (error) => {
      const apiError = error as ApiError;
      const message = apiError?.message ?? t('report.errorFallback');
      Alert.alert(t('report.errorTitle'), message);
    },
  });

  const rangeLabel = useMemo(() => {
    if (report) {
      return formatReportRange(report, locale);
    }
    if (selectedRange) {
      return formatSelectedRange(selectedRange, locale);
    }
    return t('report.rangePlaceholder');
  }, [locale, report, selectedRange, t]);
  const reportGeneratedAt = useMemo(
    () => (reportKey ? reportHistory.find((item) => item.key === reportKey)?.createdAt ?? null : null),
    [reportHistory, reportKey],
  );
  const reportGeneratedDateLabel = useMemo(
    () => (reportGeneratedAt ? formatGeneratedDate(reportGeneratedAt, locale, report?.range.timezone) : null),
    [locale, report?.range.timezone, reportGeneratedAt],
  );
  const shareFontFamily = useMemo(() => {
    if (!locale.startsWith('ja')) {
      return undefined;
    }
    return Platform.OS === 'ios' ? 'Hiragino Sans' : 'sans-serif';
  }, [locale]);
  const shareHeadlineWeight = locale.startsWith('ja') ? '600' : '700';
  const shareBodyWeight = locale.startsWith('ja') ? '500' : '600';
  const shareHeadlineLines = useMemo(
    () => (report ? wrapShareLines(sanitizeShareText(report.summary.headline), 24, 3) : []),
    [report],
  );
  const shareEvidenceCards = useMemo(
    () => (report ? buildSummaryEvidenceCards(report).slice(0, 3) : []),
    [report],
  );
  const shareIdentityLabel = useMemo(() => {
    if (!report) {
      return '';
    }
    const level = buildReportIdentityLevel(Math.round(report.summary.score), streakDays);
    return t(getReportIdentityLabelKey(level));
  }, [report, streakDays, t]);
  const shareVoiceModeLabel = useMemo(
    () => t(`report.preference.voiceMode.${report?.preference?.voiceMode ?? activeVoiceMode}`),
    [activeVoiceMode, report?.preference?.voiceMode, t],
  );
  const isGenerating =
    createReportMutation.isLoading ||
    activeRequestStatus === 'queued' ||
    activeRequestStatus === 'processing';
  const canGenerate =
    Boolean(selectedRange) &&
    (period === 'daily' ? dailyEligible : period === 'weekly' ? weeklyEligible : monthlyEligible);
  const hasHistory = reportHistory.length > 0;
  const handleExpandDetails = useCallback(() => {
    trackEvent('report.details_expanded', {
      period,
      reportKey,
      voiceMode: activeVoiceMode,
      uiVariant,
    });
    setDetailsExpanded(true);
  }, [activeVoiceMode, period, reportKey, uiVariant]);
  const handleSubmitFeedback = useCallback(
    (keyword: ReportFeedbackKey) => {
      if (submittedFeedback[keyword]) {
        return;
      }
      trackEvent('report.feedback_submitted', {
        keyword,
        period,
        reportKey,
        voiceMode: report?.preference?.voiceMode ?? activeVoiceMode,
      });
      setSubmittedFeedback((prev) => ({ ...prev, [keyword]: true }));
    },
    [activeVoiceMode, period, report, reportKey, submittedFeedback],
  );
  const handleHistorySelect = useCallback(
    (item: ReportHistoryItem) => {
      setPeriod(item.period);
      setReports((prev) => ({ ...prev, [item.key]: item.report }));
      if (item.period === 'daily') {
        setDailySelected(item.range.from);
        setDailyViewMonth(toISODateSafe(DateTime.fromISO(item.range.from).startOf('month')));
        return;
      }
      if (item.period === 'weekly') {
        setWeeklySelected(item.range.from);
        setWeeklyViewMonth(toISODateSafe(DateTime.fromISO(item.range.from).startOf('month')));
        return;
      }
      const start = DateTime.fromISO(item.range.from);
      if (start.isValid) {
        setMonthlyYear(start.year);
        setMonthlyMonth(start.month);
      }
    },
    [setDailySelected, setDailyViewMonth, setMonthlyMonth, setMonthlyYear, setPeriod, setReports, setWeeklySelected, setWeeklyViewMonth],
  );
  const handleDailyMonthShift = (delta: number) => {
    setDailyViewMonth((prev) => toISODateSafe(DateTime.fromISO(prev).plus({ months: delta }).startOf('month')));
  };
  const handleWeeklyMonthShift = (delta: number) => {
    setWeeklyViewMonth((prev) => toISODateSafe(DateTime.fromISO(prev).plus({ months: delta }).startOf('month')));
  };
  const handleDailySelect = (isoDate: string) => {
    setDailySelected(isoDate);
    setDailyViewMonth(toISODateSafe(DateTime.fromISO(isoDate).startOf('month')));
  };
  const handleWeeklySelect = (isoDate: string) => {
    setWeeklySelected(isoDate);
    setWeeklyViewMonth(toISODateSafe(DateTime.fromISO(isoDate).startOf('month')));
  };

  const handleGenerate = () => {
    if (createReportMutation.isLoading || isGenerating) {
      return;
    }
    if (!selectedRange) {
      Alert.alert(t('report.errorTitle'), t('report.rangeMissing'));
      return;
    }
    if (!preferenceConfigured) {
      pendingGenerateRef.current = { period, range: selectedRange };
      setShowPreferenceModal(true);
      return;
    }
    trackEvent('report.generate_requested', {
      period,
      from: selectedRange.from,
      to: selectedRange.to,
      timezone: selectedTimezone,
      voiceMode: activeVoiceMode,
      uiVariant,
    });
    createReportMutation.mutate({
      period,
      range: selectedRange,
      preferenceOverride: activePreference,
    });
  };

  const handleSavePreference = () => {
    updatePreferenceMutation.mutate(draftPreference);
  };

  const handleShareReport = async () => {
    if (!report) return;
    try {
      if (!cacheDirectory) {
        Alert.alert(t('report.errorTitle'), t('report.shareFailed'));
        return;
      }
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert(t('report.errorTitle'), t('report.shareUnavailable'));
        return;
      }
      const svgNode = shareSvgRef.current;
      if (!svgNode || typeof svgNode.toDataURL !== 'function') {
        Alert.alert(t('report.errorTitle'), t('report.shareFailed'));
        return;
      }
      const pngBase64 = await new Promise<string>((resolve, reject) => {
        svgNode.toDataURL((data) => {
          if (data) {
            resolve(data);
            return;
          }
          reject(new Error('Missing image payload'));
        });
      });
      const fileUri = `${cacheDirectory}ai-report-${Date.now()}.png`;
      await writeAsStringAsync(fileUri, pngBase64, { encoding: EncodingType.Base64 });
      try {
        await Sharing.shareAsync(fileUri, {
          dialogTitle: t('report.shareButton'),
          mimeType: 'image/png',
          UTI: 'public.png',
        });
        trackEvent('report.shared', {
          period: report.period,
          voiceMode: report.preference?.voiceMode ?? activeVoiceMode,
          score: Math.round(report.summary.score),
          uiVariant,
        });
      } finally {
        await deleteAsync(fileUri, { idempotent: true });
      }
    } catch (error) {
      console.error('Failed to share report', error);
      Alert.alert(t('report.errorTitle'), t('report.shareFailed'));
    }
  };

  const formatPriority = (value: AiReportAdvice['priority']) => {
    if (value === 'high') return `🚨 ${t('report.priority.high')}`;
    if (value === 'medium') return `⚡️ ${t('report.priority.medium')}`;
    return `🌿 ${t('report.priority.low')}`;
  };

  const priorityBadgeStyle = (value: AiReportAdvice['priority']) => {
    if (value === 'high') return styles.priorityBadgeHigh;
    if (value === 'medium') return styles.priorityBadgeMedium;
    return styles.priorityBadgeLow;
  };

  const priorityTextStyle = (value: AiReportAdvice['priority']) => {
    if (value === 'high') return styles.priorityTextHigh;
    if (value === 'medium') return styles.priorityTextMedium;
    return styles.priorityTextLow;
  };

  const renderAdviceDetail = (detail: string) => {
    const tokens = detail.split(/(\d+(?:[.,]\d+)?\s*(?:kcal|g|%|日|days|kg|回)?)/gi);
    return tokens.map((token, index) => {
      if (!token) return null;
      const isEmphasis = /\d/.test(token);
      return (
        <Text key={`advice-token-${index}`} style={isEmphasis ? styles.adviceDetailEmphasis : undefined}>
          {token}
        </Text>
      );
    });
  };

  return (
    <AuroraBackground style={styles.container}>
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Text style={styles.title}>{t('report.header')}</Text>
            <Text style={styles.subtitle}>{t('report.subtitle')}</Text>
          </View>

          <View style={styles.segmentGroup} accessibilityRole="tablist">
            {periodOptions.map((option) => {
              const active = option.key === period;
              const disabled = createReportMutation.isLoading || isGenerating;
              return (
                <TouchableOpacity
                  key={option.key}
                  style={[
                    styles.segmentButton,
                    active && styles.segmentButtonActive,
                    disabled && styles.segmentButtonDisabled,
                  ]}
                  onPress={() => setPeriod(option.key)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active, disabled }}
                  disabled={disabled}
                >
                  <Text style={[styles.segmentLabel, active && styles.segmentLabelActive]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={styles.periodHint}>{periodHints[period]}</Text>

          <View style={styles.rangeRow}>
            <Text style={styles.rangeLabel}>{t('report.rangeLabel')}</Text>
            <Text style={styles.rangeValue}>{rangeLabel}</Text>
          </View>

          <GlassCard style={styles.card}>
            <View style={styles.preferenceHeader}>
              <Text style={styles.cardTitle}>🎛️ {t('report.preference.title')}</Text>
              <TouchableOpacity style={styles.preferenceEditButton} onPress={() => setShowPreferenceModal(true)}>
                <Text style={styles.preferenceEditLabel}>{t('report.preference.edit')}</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.preferenceSummary}>
              {activePreference.focusAreas.map((focus) => t(`report.preference.focus.${focus}`)).join(', ')} /{' '}
              {t(`report.preference.style.${activePreference.adviceStyle}`)} /{' '}
              {t(`report.preference.voiceMode.${activeVoiceMode}`)}
            </Text>
            <View style={styles.voiceModeRow}>
              {voiceModeOptions.map((mode) => {
                const selected = mode === activeVoiceMode;
                return (
                  <TouchableOpacity
                    key={mode}
                    style={[styles.voiceModeChip, selected && styles.voiceModeChipActive]}
                    onPress={() => handleQuickVoiceModeChange(mode)}
                    disabled={updatePreferenceMutation.isLoading}
                  >
                    <Text style={[styles.voiceModeChipText, selected && styles.voiceModeChipTextActive]}>
                      {t(`report.preference.voiceMode.${mode}`)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {!preferenceConfigured ? (
              <Text style={styles.preferenceNotice}>{t('report.preference.required')}</Text>
            ) : null}
          </GlassCard>

          <GlassCard style={styles.card}>
            <Text style={styles.cardTitle}>📅 {t('report.section.rangeSelect')}</Text>
            {period === 'daily' ? (
              <>
                <Text style={styles.calendarHint}>{t('report.calendar.hint.daily')}</Text>
                {calendarSummary.isLoading && !calendarData ? <ActivityIndicator color={colors.accent} /> : null}
                <ReportCalendar
                  locale={locale}
                  month={DateTime.fromISO(dailyViewMonth)}
                  mode="daily"
                  recordedDates={recordedDays}
                  selectedDate={dailySelected}
                  selectedWeekAnchor={null}
                  weekLogCounts={weeklyLogCounts}
                  minWeekDays={REPORT_MIN_LOG_DAYS.weekly}
                  onSelectDate={handleDailySelect}
                  onSelectWeek={handleWeeklySelect}
                  onPrevMonth={() => handleDailyMonthShift(-1)}
                  onNextMonth={() => handleDailyMonthShift(1)}
                />
                {!hasRecordedDays ? (
                  <Text style={styles.calendarEmpty}>{t('report.calendar.empty')}</Text>
                ) : null}
              </>
            ) : period === 'weekly' ? (
              <>
                <Text style={styles.calendarHint}>{t('report.calendar.hint.weekly')}</Text>
                {calendarSummary.isLoading && !calendarData ? <ActivityIndicator color={colors.accent} /> : null}
                <ReportCalendar
                  locale={locale}
                  month={DateTime.fromISO(weeklyViewMonth)}
                  mode="weekly"
                  recordedDates={recordedDays}
                  selectedDate={null}
                  selectedWeekAnchor={weeklySelected}
                  weekLogCounts={weeklyLogCounts}
                  minWeekDays={REPORT_MIN_LOG_DAYS.weekly}
                  onSelectDate={handleWeeklySelect}
                  onSelectWeek={handleWeeklySelect}
                  onPrevMonth={() => handleWeeklyMonthShift(-1)}
                  onNextMonth={() => handleWeeklyMonthShift(1)}
                />
                {!hasRecordedDays ? (
                  <Text style={styles.calendarEmpty}>{t('report.calendar.empty')}</Text>
                ) : !hasEligibleWeeks ? (
                  <Text style={styles.calendarEmpty}>
                    {t('report.calendar.insufficientWeekly', { minDays: REPORT_MIN_LOG_DAYS.weekly })}
                  </Text>
                ) : null}
              </>
            ) : (
              <>
                <Text style={styles.calendarHint}>{t('report.calendar.hint.monthly')}</Text>
                <MonthPicker
                  locale={locale}
                  year={monthlyYear}
                  month={monthlyMonth}
                  onYearChange={(next) => setMonthlyYear(next)}
                  onMonthChange={(next) => setMonthlyMonth(next)}
                />
                {period === 'monthly' && monthlySummary.isLoading && !monthlyData ? (
                  <ActivityIndicator color={colors.accent} />
                ) : !monthlyEligible ? (
                  <Text style={styles.calendarEmpty}>
                    {t('report.calendar.insufficientMonthly', { minDays: REPORT_MIN_LOG_DAYS.monthly })}
                  </Text>
                ) : null}
              </>
            )}
          </GlassCard>

          <PrimaryButton
            label={
              createReportMutation.isLoading || isGenerating
                ? t('report.generatingShort')
                : report
                  ? t('report.generateAgain')
                  : t('report.generate')
            }
            onPress={handleGenerate}
            loading={createReportMutation.isLoading || isGenerating}
            disabled={!canGenerate || isGenerating}
          />
          {createReportMutation.isLoading || isGenerating ? (
            <View style={styles.loadingInline}>
              <ActivityIndicator color={colors.textMuted} />
              <Text style={styles.loadingInlineText}>{t('report.generating')}</Text>
            </View>
          ) : (
            <Text style={styles.tokenNote}>{t('report.tokenNote')}</Text>
          )}

          {report ? (
            isSmartPro ? (
              <ReportSummaryV2
                report={report}
                period={period}
                voiceMode={activeVoiceMode as AiReportVoiceMode}
                generatedDateLabel={reportGeneratedDateLabel}
                summaryStats={summaryStats}
                streakDays={streakDays}
                detailsExpanded={detailsExpanded}
                onToggleDetails={() => {
                  if (detailsExpanded) {
                    setDetailsExpanded(false);
                    return;
                  }
                  handleExpandDetails();
                }}
                onShare={handleShareReport}
                t={t}
              />
            ) : (
              <GlassCard style={styles.card} contentStyle={styles.summaryCardContent}>
                  <ExpoLinearGradient
                    colors={['rgba(245,178,37,0.2)', 'rgba(116,210,194,0.1)', 'rgba(255,255,255,0.0)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.summaryCardGradient}
                    pointerEvents="none"
                  />
                  <Text style={styles.cardTitle}>✨ {t('report.section.summary')}</Text>
                  {reportGeneratedDateLabel ? (
                    <Text style={styles.summaryGeneratedDate}>
                      {t('report.summary.generatedDate')}: {reportGeneratedDateLabel}
                    </Text>
                  ) : null}
                  <View style={styles.summaryHero}>
                    <ScoreRing
                      score={Math.round(report.summary.score)}
                      label={t('report.scoreLabel')}
                      emoji={scoreEmoji(report.summary.score)}
                      size={130}
                    />
                    <View style={styles.heroStats}>
                      <View style={styles.heroAchievement}>
                        <Text style={styles.heroAchievementLabel}>🎯 {t('report.stat.achievement')}</Text>
                        <Text style={styles.heroAchievementValue}>
                          {summaryStats ? `${summaryStats.achievement}%` : '--'}
                        </Text>
                      </View>
                      <View style={styles.heroStat}>
                        <Text style={styles.heroStatLabel}>🔥 {t('report.stat.averageCalories')}</Text>
                        <Text style={styles.heroStatValue}>{summaryStats ? `${summaryStats.averageCalories} kcal` : '--'}</Text>
                      </View>
                      <View style={styles.heroStat}>
                        <Text style={styles.heroStatLabel}>🗓️ {t('report.stat.loggedDays')}</Text>
                        <Text style={styles.heroStatValue}>{summaryStats ? `${summaryStats.loggedDays} / ${summaryStats.totalDays}` : '--'}</Text>
                      </View>
                      <View style={styles.heroStat}>
                        <Text style={styles.heroStatLabel}>🔥 {t('report.streakLabel')}</Text>
                        <Text style={styles.heroStatValue}>{streakDays}</Text>
                      </View>
                    </View>
                  </View>
                  <Text style={styles.summaryHeadline}>{report.summary.headline}</Text>
                  <View style={styles.highlightRow}>
                    {report.summary.highlights.map((highlight, index) => (
                      <View
                        key={`${highlight}-${index}`}
                        style={[styles.highlightChip, { backgroundColor: `${highlightTint(index)}33` }]}
                      >
                        <Text style={styles.highlightText}>{highlight}</Text>
                      </View>
                    ))}
                  </View>
                  <View style={styles.summaryActionRow}>
                    {detailsExpanded ? (
                      <TouchableOpacity
                        style={styles.summaryCollapseButton}
                        onPress={() => setDetailsExpanded(false)}
                        accessibilityRole="button"
                        accessibilityLabel={t('report.hideDetails')}
                      >
                        <Text style={styles.summaryCollapseText}>⌃</Text>
                      </TouchableOpacity>
                    ) : null}
                    <TouchableOpacity
                      style={[styles.summaryActionButton, styles.summaryActionButtonPrimary]}
                      onPress={handleShareReport}
                    >
                      <Text style={[styles.summaryActionText, styles.summaryActionTextStrong]}>{t('report.shareButton')}</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.feedbackSection}>
                    <Text style={styles.feedbackTitle}>{t('report.feedback.title')}</Text>
                    <View style={styles.feedbackChipRow}>
                      {REPORT_FEEDBACK_OPTIONS.map((option) => {
                        const selected = submittedFeedback[option.key];
                        return (
                          <TouchableOpacity
                            key={option.key}
                            style={[styles.feedbackChip, selected && styles.feedbackChipSelected]}
                            onPress={() => handleSubmitFeedback(option.key)}
                            disabled={selected}
                          >
                            <Text style={[styles.feedbackChipText, selected && styles.feedbackChipTextSelected]}>
                              {selected ? `✓ ${t(option.labelKey)}` : t(option.labelKey)}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    <Text style={styles.feedbackHint}>{t('report.feedback.subtitle')}</Text>
                  </View>
              </GlassCard>
            )
          ) : null}

          {report && isSmartPro ? (
            <SectionShellV2 icon="🗳️" title={t('report.section.afterAction')} quickStat={t('report.section.quick.feedback')}>
              <View style={styles.feedbackSection}>
                <Text style={styles.feedbackTitle}>{t('report.feedback.title')}</Text>
                <View style={styles.feedbackChipRow}>
                  {REPORT_FEEDBACK_OPTIONS.map((option) => {
                    const selected = submittedFeedback[option.key];
                    return (
                      <TouchableOpacity
                        key={option.key}
                        style={[styles.feedbackChip, selected && styles.feedbackChipSelected]}
                        onPress={() => handleSubmitFeedback(option.key)}
                        disabled={selected}
                      >
                        <Text style={[styles.feedbackChipText, selected && styles.feedbackChipTextSelected]}>
                          {selected ? `✓ ${t(option.labelKey)}` : t(option.labelKey)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Text style={styles.feedbackHint}>{t('report.feedback.subtitle')}</Text>
              </View>
            </SectionShellV2>
          ) : null}

          {!report ? (
            <GlassCard style={styles.card}>
              <Text style={styles.emptyTitle}>{t('report.emptyTitle')}</Text>
              <Text style={styles.emptyBody}>{t('report.emptyBody')}</Text>
              {hasHistory ? (
                <View style={styles.historySection}>
                  <Text style={styles.historyTitle}>{t('report.history.title')}</Text>
                  <View style={styles.historyList}>
                    {reportHistory.map((item) => (
                      <TouchableOpacity key={item.key} style={styles.historyItem} onPress={() => handleHistorySelect(item)}>
                        <View style={styles.historyHeader}>
                          <Text style={styles.historyRange}>{formatSelectedRange(item.range, locale)}</Text>
                          <View style={styles.historyPill}>
                            <Text style={styles.historyPillText}>{t(`report.period.${item.period}`)}</Text>
                          </View>
                        </View>
                        <Text style={styles.historyHeadline} numberOfLines={2}>
                          {item.headline}
                        </Text>
                        <View style={styles.historyMeta}>
                          <Text style={styles.historyMetaText}>
                            {scoreEmoji(item.score)} {Math.round(item.score)}
                          </Text>
                          <Text style={styles.historyMetaText}>{formatHistoryDate(item.createdAt, locale)}</Text>
                          <Text style={styles.historyAction}>{t('report.history.open')}</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ) : null}
            </GlassCard>
          ) : (
            <>
              {showWeeklyPrompt ? (
                isSmartPro ? (
                  <SectionShellV2
                    icon="🧭"
                    title={t('report.weeklyPrompt.title')}
                    quickStat={t('report.section.quick.streakDays', { value: streakDays })}
                  >
                    <Text style={styles.emptyBody}>{t('report.weeklyPrompt.body', { days: streakDays })}</Text>
                    <TouchableOpacity style={[styles.summaryActionButton, styles.smartProActionSecondary]} onPress={() => setPeriod('weekly')}>
                      <Text style={styles.summaryActionText}>{t('report.weeklyPrompt.cta')}</Text>
                    </TouchableOpacity>
                  </SectionShellV2>
                ) : (
                  <GlassCard style={styles.card}>
                    <Text style={styles.cardTitle}>🧭 {t('report.weeklyPrompt.title')}</Text>
                    <Text style={styles.emptyBody}>{t('report.weeklyPrompt.body', { days: streakDays })}</Text>
                    <TouchableOpacity style={styles.summaryActionButton} onPress={() => setPeriod('weekly')}>
                      <Text style={styles.summaryActionText}>{t('report.weeklyPrompt.cta')}</Text>
                    </TouchableOpacity>
                  </GlassCard>
                )
              ) : null}

              {!detailsExpanded ? (
                isSmartPro ? null : (
                  <GlassCard style={styles.card}>
                    <Text style={styles.emptyBody}>{t('report.detailsCollapsed')}</Text>
                    <TouchableOpacity
                      style={[styles.summaryActionButton, styles.detailsPromptButton, styles.summaryActionButtonPrimary]}
                      onPress={handleExpandDetails}
                    >
                      <Text style={[styles.summaryActionText, styles.summaryActionTextStrong]}>{t('report.showDetails')}</Text>
                    </TouchableOpacity>
                  </GlassCard>
                )
              ) : (
                <>
                  {report.comparison?.metrics?.length ? (
                    isSmartPro ? (
                      <SectionShellV2
                        icon="📊"
                        title={t('report.section.comparison')}
                        quickStat={sectionQuickStats?.comparison}
                      >
                        {typeof report.comparison.scoreDelta === 'number' ? (
                          <Text style={styles.comparisonScoreDelta}>
                            {t('report.comparison.scoreDelta', {
                              value:
                                report.comparison.scoreDelta > 0
                                  ? `+${report.comparison.scoreDelta}`
                                  : `${report.comparison.scoreDelta}`,
                            })}
                          </Text>
                        ) : null}
                        <View style={styles.comparisonList}>
                          {report.comparison.metrics.map((metric) => {
                            const improved = isMetricImproved(metric);
                            return (
                              <View key={metric.key} style={styles.comparisonItem}>
                                <View style={styles.comparisonItemTop}>
                                  <Text style={styles.comparisonLabel}>{metric.label}</Text>
                                  <Text style={styles.comparisonValue}>{formatComparisonValue(metric)}</Text>
                                </View>
                                <Text
                                  style={[
                                    styles.comparisonDelta,
                                    improved ? styles.comparisonDeltaGood : styles.comparisonDeltaBad,
                                  ]}
                                >
                                  {formatDeltaValue(metric)}
                                </Text>
                              </View>
                            );
                          })}
                        </View>
                      </SectionShellV2>
                    ) : (
                      <GlassCard style={styles.card}>
                        <Text style={styles.cardTitle}>📊 {t('report.section.comparison')}</Text>
                        {typeof report.comparison.scoreDelta === 'number' ? (
                          <Text style={styles.comparisonScoreDelta}>
                            {t('report.comparison.scoreDelta', {
                              value:
                                report.comparison.scoreDelta > 0
                                  ? `+${report.comparison.scoreDelta}`
                                  : `${report.comparison.scoreDelta}`,
                            })}
                          </Text>
                        ) : null}
                        <View style={styles.comparisonList}>
                          {report.comparison.metrics.map((metric) => {
                            const improved = isMetricImproved(metric);
                            return (
                              <View key={metric.key} style={styles.comparisonItem}>
                                <View style={styles.comparisonItemTop}>
                                  <Text style={styles.comparisonLabel}>{metric.label}</Text>
                                  <Text style={styles.comparisonValue}>{formatComparisonValue(metric)}</Text>
                                </View>
                                <Text
                                  style={[
                                    styles.comparisonDelta,
                                    improved ? styles.comparisonDeltaGood : styles.comparisonDeltaBad,
                                  ]}
                                >
                                  {formatDeltaValue(metric)}
                                </Text>
                              </View>
                            );
                          })}
                        </View>
                      </GlassCard>
                    )
                  ) : null}

                  {isSmartPro ? (
                    <SectionShellV2
                      icon="📈"
                      title={t('report.section.trend')}
                      quickStat={sectionQuickStats?.trend}
                    >
                      {dashboardSummary.isLoading && !dashboard ? (
                        <ActivityIndicator color={colors.accent} />
                      ) : dashboard?.calories.points.length ? (
                        <TrendLineChart
                          points={dashboard.calories.points}
                          target={dashboard.calories.targetLine}
                          targetLabel={t('dashboard.chart.targetLabel', { value: Math.round(dashboard.calories.targetLine) })}
                          axisLabelY={t('dashboard.chart.axisY')}
                          axisLabelX={t('dashboard.chart.axisX')}
                        />
                      ) : (
                        <Text style={styles.emptyBody}>{t('dashboard.chart.empty')}</Text>
                      )}
                      {dashboard?.calories.targetLine ? (
                        <Text style={styles.trendNote}>
                          {t('dashboard.chart.targetLabel', { value: Math.round(dashboard.calories.targetLine) })}
                        </Text>
                      ) : null}
                    </SectionShellV2>
                  ) : (
                    <GlassCard style={styles.card}>
                      <Text style={styles.cardTitle}>📈 {t('report.section.trend')}</Text>
                      {dashboardSummary.isLoading && !dashboard ? (
                        <ActivityIndicator color={colors.accent} />
                      ) : dashboard?.calories.points.length ? (
                        <TrendLineChart
                          points={dashboard.calories.points}
                          target={dashboard.calories.targetLine}
                          targetLabel={t('dashboard.chart.targetLabel', { value: Math.round(dashboard.calories.targetLine) })}
                          axisLabelY={t('dashboard.chart.axisY')}
                          axisLabelX={t('dashboard.chart.axisX')}
                        />
                      ) : (
                        <Text style={styles.emptyBody}>{t('dashboard.chart.empty')}</Text>
                      )}
                      {dashboard?.calories.targetLine ? (
                        <Text style={styles.trendNote}>
                          {t('dashboard.chart.targetLabel', { value: Math.round(dashboard.calories.targetLine) })}
                        </Text>
                      ) : null}
                    </GlassCard>
                  )}

                  {isSmartPro ? (
                    <SectionShellV2
                      icon="🥗"
                      title={t('report.section.macros')}
                      quickStat={sectionQuickStats?.macros}
                    >
                      {dashboard ? (
                        <View style={[styles.macroWrap, compactLayout && styles.macroWrapCompact]}>
                          <MacroDonut macros={dashboard.macros} totalCalories={dashboard.summary.macros.total.calories} />
                          <View style={styles.macroLegend}>
                            {dashboard.macros.map((macro) => {
                              const macroColor = MACRO_META[macro.key].color;
                              const progress = Math.max(
                                0,
                                Math.min(100, Math.round((macro.actual / Math.max(1, macro.target)) * 100)),
                              );
                              const remain = Math.max(0, Math.round(macro.target - macro.actual));

                              return (
                                <View key={macro.key} style={styles.macroLegendItem}>
                                  <View style={styles.macroLegendRow}>
                                    <View style={[styles.macroDot, { backgroundColor: macroColor }]} />
                                    <Text style={styles.macroLegendText}>
                                      {MACRO_META[macro.key].emoji} {macro.label}
                                    </Text>
                                    <Text style={styles.macroLegendValue}>
                                      {Math.round(macro.actual)} / {Math.round(macro.target)}g
                                    </Text>
                                  </View>
                                  <View style={styles.macroProgressTrack}>
                                    <View
                                      style={[
                                        styles.macroProgressFill,
                                        {
                                          backgroundColor: macroColor,
                                          width: `${progress}%`,
                                        },
                                      ]}
                                    />
                                  </View>
                                  <Text style={[styles.macroRemainText, { color: macroColor }]}>
                                    {locale.startsWith('ja') ? `残り ${remain}g` : `${remain}g left`}
                                  </Text>
                                </View>
                              );
                            })}
                          </View>
                        </View>
                      ) : (
                        <Text style={styles.emptyBody}>{t('dashboard.chart.empty')}</Text>
                      )}
                    </SectionShellV2>
                  ) : (
                    <GlassCard style={styles.card}>
                      <Text style={styles.cardTitle}>🥗 {t('report.section.macros')}</Text>
                      {dashboard ? (
                        <View style={styles.macroWrap}>
                          <MacroDonut macros={dashboard.macros} totalCalories={dashboard.summary.macros.total.calories} />
                          <View style={styles.macroLegend}>
                            {dashboard.macros.map((macro) => {
                              const macroColor = MACRO_META[macro.key].color;
                              const progress = Math.max(
                                0,
                                Math.min(100, Math.round((macro.actual / Math.max(1, macro.target)) * 100)),
                              );
                              const remain = Math.max(0, Math.round(macro.target - macro.actual));

                              return (
                                <View key={macro.key} style={styles.macroLegendItem}>
                                  <View style={styles.macroLegendRow}>
                                    <View style={[styles.macroDot, { backgroundColor: macroColor }]} />
                                    <Text style={styles.macroLegendText}>
                                      {MACRO_META[macro.key].emoji} {macro.label}
                                    </Text>
                                    <Text style={styles.macroLegendValue}>
                                      {Math.round(macro.actual)} / {Math.round(macro.target)}g
                                    </Text>
                                  </View>
                                  <View style={styles.macroProgressTrack}>
                                    <View
                                      style={[
                                        styles.macroProgressFill,
                                        {
                                          backgroundColor: macroColor,
                                          width: `${progress}%`,
                                        },
                                      ]}
                                    />
                                  </View>
                                  <Text style={[styles.macroRemainText, { color: macroColor }]}>
                                    {locale.startsWith('ja') ? `残り ${remain}g` : `${remain}g left`}
                                  </Text>
                                </View>
                              );
                            })}
                          </View>
                        </View>
                      ) : (
                        <Text style={styles.emptyBody}>{t('dashboard.chart.empty')}</Text>
                      )}
                    </GlassCard>
                  )}

                  {isSmartPro ? (
                    <SectionShellV2
                      icon="🍽️"
                      title={t('report.section.mealTiming')}
                      quickStat={sectionQuickStats?.mealTiming}
                    >
                      {dashboard ? (
                        <MealTimingStack entries={dashboard.calories.mealPeriodBreakdown} />
                      ) : (
                        <Text style={styles.emptyBody}>{t('dashboard.chart.empty')}</Text>
                      )}
                    </SectionShellV2>
                  ) : (
                    <GlassCard style={styles.card}>
                      <Text style={styles.cardTitle}>🍽️ {t('report.section.mealTiming')}</Text>
                      {dashboard ? (
                        <MealTimingStack entries={dashboard.calories.mealPeriodBreakdown} />
                      ) : (
                        <Text style={styles.emptyBody}>{t('dashboard.chart.empty')}</Text>
                      )}
                    </GlassCard>
                  )}

                  {isSmartPro ? (
                    <SectionShellV2 icon="📌" title={t('report.section.metrics')} quickStat={sectionQuickStats?.metrics}>
                      <View style={styles.metricGrid}>
                        {report.metrics.map((metric, index) => (
                          <View key={`${metric.label}-${index}`} style={[styles.metricItem, compactLayout && styles.metricItemCompact]}>
                            <Text style={styles.metricLabel}>{metric.label}</Text>
                            <Text style={styles.metricValue}>{metric.value}</Text>
                            {metric.note ? <Text style={styles.metricNote}>{metric.note}</Text> : null}
                          </View>
                        ))}
                      </View>
                    </SectionShellV2>
                  ) : (
                    <GlassCard style={styles.card}>
                      <Text style={styles.cardTitle}>📌 {t('report.section.metrics')}</Text>
                      <View style={styles.metricGrid}>
                        {report.metrics.map((metric, index) => (
                          <View key={`${metric.label}-${index}`} style={styles.metricItem}>
                            <Text style={styles.metricLabel}>{metric.label}</Text>
                            <Text style={styles.metricValue}>{metric.value}</Text>
                            {metric.note ? <Text style={styles.metricNote}>{metric.note}</Text> : null}
                          </View>
                        ))}
                      </View>
                    </GlassCard>
                  )}

                  {isSmartPro ? (
                    <SectionShellV2
                      icon="🥦"
                      title={t('report.section.ingredients')}
                      quickStat={sectionQuickStats?.ingredients}
                    >
                      <View style={styles.ingredientList}>
                        {report.ingredients.map((ingredient, index) => (
                          <View key={`${ingredient.name}-${index}`} style={styles.ingredientItem}>
                            <Text style={styles.ingredientName}>{ingredient.name}</Text>
                            <Text style={styles.ingredientReason}>{ingredient.reason}</Text>
                          </View>
                        ))}
                      </View>
                    </SectionShellV2>
                  ) : (
                    <GlassCard style={styles.card}>
                      <Text style={styles.cardTitle}>🥦 {t('report.section.ingredients')}</Text>
                      <View style={styles.ingredientList}>
                        {report.ingredients.map((ingredient, index) => (
                          <View key={`${ingredient.name}-${index}`} style={styles.ingredientItem}>
                            <Text style={styles.ingredientName}>{ingredient.name}</Text>
                            <Text style={styles.ingredientReason}>{ingredient.reason}</Text>
                          </View>
                        ))}
                      </View>
                    </GlassCard>
                  )}

                  {isSmartPro ? (
                    <SectionShellV2 icon="💡" title={t('report.section.advice')} quickStat={sectionQuickStats?.advice}>
                      <View style={styles.adviceList}>
                        {report.advice.map((advice, index) => (
                          <View key={`${advice.title}-${index}`} style={styles.adviceItem}>
                            <View style={styles.adviceHeader}>
                              <View style={[styles.priorityBadge, priorityBadgeStyle(advice.priority)]}>
                                <Text style={[styles.priorityText, priorityTextStyle(advice.priority)]}>{formatPriority(advice.priority)}</Text>
                              </View>
                              <Text style={styles.adviceTitle}>{advice.title}</Text>
                            </View>
                            <Text style={styles.adviceDetail}>{renderAdviceDetail(advice.detail)}</Text>
                          </View>
                        ))}
                      </View>
                    </SectionShellV2>
                  ) : (
                    <GlassCard style={styles.card}>
                      <Text style={styles.cardTitle}>💡 {t('report.section.advice')}</Text>
                      <View style={styles.adviceList}>
                        {report.advice.map((advice, index) => (
                          <View key={`${advice.title}-${index}`} style={styles.adviceItem}>
                            <View style={styles.adviceHeader}>
                              <View style={[styles.priorityBadge, priorityBadgeStyle(advice.priority)]}>
                                <Text style={[styles.priorityText, priorityTextStyle(advice.priority)]}>{formatPriority(advice.priority)}</Text>
                              </View>
                              <Text style={styles.adviceTitle}>{advice.title}</Text>
                            </View>
                            <Text style={styles.adviceDetail}>{renderAdviceDetail(advice.detail)}</Text>
                          </View>
                        ))}
                      </View>
                    </GlassCard>
                  )}
                </>
              )}
            </>
          )}
        </ScrollView>
        {report ? (
          <View pointerEvents="none" style={styles.shareRenderTarget}>
            <Svg ref={shareSvgRef} width={SHARE_IMAGE_WIDTH} height={SHARE_IMAGE_HEIGHT}>
              <Defs>
                <LinearGradient id="shareBg" x1="0" y1="0" x2="1" y2="1">
                  <Stop offset="0" stopColor={colors.smartProBgStart} />
                  <Stop offset="1" stopColor={colors.smartProBgEnd} />
                </LinearGradient>
                <LinearGradient id="shareCard" x1="0" y1="0" x2="1" y2="1">
                  <Stop offset="0" stopColor={colors.smartProCard} />
                  <Stop offset="1" stopColor="#EEF3FF" />
                </LinearGradient>
              </Defs>
              <Rect x={0} y={0} width={SHARE_IMAGE_WIDTH} height={SHARE_IMAGE_HEIGHT} fill="url(#shareBg)" />
              <Rect x={56} y={56} width={SHARE_IMAGE_WIDTH - 112} height={SHARE_IMAGE_HEIGHT - 112} rx={42} fill="url(#shareCard)" />

              <SvgText x={96} y={128} fill="#101723" fontSize={52} fontWeight={shareHeadlineWeight} fontFamily={shareFontFamily}>
                {t('report.header')}
              </SvgText>
              <SvgText x={96} y={178} fill="#5D6678" fontSize={28} fontFamily={shareFontFamily}>
                {rangeLabel}
              </SvgText>
              <SvgText x={96} y={214} fill="#5D6678" fontSize={24} fontFamily={shareFontFamily}>
                {`${t('report.summary.generatedDate')}: ${reportGeneratedDateLabel ?? '-'}`}
              </SvgText>

              <Rect x={96} y={246} width={306} height={70} rx={35} fill="#131A28" />
              <SvgText x={118} y={289} fill="#F7F9FF" fontSize={28} fontWeight="800" fontFamily={shareFontFamily}>
                {shareIdentityLabel}
              </SvgText>
              <Rect x={420} y={246} width={264} height={70} rx={35} fill="#EAF2FF" />
              <SvgText x={444} y={289} fill="#2A3346" fontSize={26} fontWeight="700" fontFamily={shareFontFamily}>
                {shareVoiceModeLabel}
              </SvgText>
              <Rect x={704} y={246} width={280} height={70} rx={35} fill="#F8EDCF" />
              <SvgText x={730} y={289} fill="#5B4522" fontSize={26} fontWeight="700" fontFamily={shareFontFamily}>
                {t(`report.period.${report.period}`)}
              </SvgText>

              <SvgText x={96} y={434} fill="#101723" fontSize={172} fontWeight="800">
                {Math.round(report.summary.score)}
              </SvgText>
              <SvgText x={352} y={398} fill="#5D6678" fontSize={36} fontWeight={shareBodyWeight} fontFamily={shareFontFamily}>
                {t('report.scoreLabel')}
              </SvgText>
              <SvgText x={352} y={444} fill="#5D6678" fontSize={28} fontWeight={shareBodyWeight} fontFamily={shareFontFamily}>
                {scoreEmoji(report.summary.score)}
              </SvgText>

              <Rect x={96} y={488} width={888} height={170} rx={24} fill="rgba(20,30,48,0.06)" />
              <SvgText x={126} y={536} fill="#556177" fontSize={24} fontWeight={shareBodyWeight} fontFamily={shareFontFamily}>
                {t('report.summaryV2.topMission')}
              </SvgText>
              {shareHeadlineLines.map((lineText, index) => (
                <SvgText
                  key={`share-headline-${index}`}
                  x={126}
                  y={588 + index * 44}
                  fill="#121A29"
                  fontSize={42}
                  fontWeight={shareHeadlineWeight}
                  fontFamily={shareFontFamily}
                >
                  {lineText}
                </SvgText>
              ))}

              <SvgText x={96} y={732} fill="#556177" fontSize={24} fontWeight={shareHeadlineWeight} fontFamily={shareFontFamily}>
                {t('report.summaryV2.evidence')}
              </SvgText>
              {shareEvidenceCards.map((item, index) => {
                const y = 764 + index * 122;
                const bg = item.tone === 'amber' ? '#F8F0DA' : item.tone === 'mint' ? '#E6F5F2' : '#ECE8F8';
                return (
                  <G key={item.id}>
                    <Rect x={96} y={y} width={888} height={100} rx={20} fill={bg} />
                    <SvgText x={126} y={y + 39} fill="#121A29" fontSize={24} fontWeight="700" fontFamily={shareFontFamily}>
                      {item.icon}
                    </SvgText>
                    <SvgText x={164} y={y + 39} fill="#121A29" fontSize={26} fontWeight={shareBodyWeight} fontFamily={shareFontFamily}>
                      {wrapShareLines(sanitizeShareText(item.text), 42, 1).join('')}
                    </SvgText>
                    {item.emphasis ? (
                      <SvgText x={164} y={y + 74} fill="#2A3346" fontSize={24} fontWeight="800" fontFamily={shareFontFamily}>
                        {item.emphasis}
                      </SvgText>
                    ) : null}
                  </G>
                );
              })}
            </Svg>
          </View>
        ) : null}
        {scoreEffect ? (
          <Animated.View style={[styles.effectOverlay, { opacity: scoreEffectOpacity }]}>
            <Text style={styles.effectEmoji}>{scoreEffect === 'celebration' ? '🎉' : '☁️'}</Text>
            <Text style={styles.effectMessage}>{scoreEffectMessage}</Text>
          </Animated.View>
        ) : null}
        <ReportPreferenceModal
          visible={showPreferenceModal}
          onClose={() => {
            pendingGenerateRef.current = null;
            setShowPreferenceModal(false);
          }}
          preference={draftPreference}
          onChange={setDraftPreference}
          onSave={handleSavePreference}
          loading={updatePreferenceMutation.isLoading}
          t={t}
        />
      </SafeAreaView>
    </AuroraBackground>
  );
}

function ReportPreferenceModal({
  visible,
  onClose,
  preference,
  onChange,
  onSave,
  loading,
  t,
}: {
  visible: boolean;
  onClose: () => void;
  preference: AiReportPreferenceInput;
  onChange: (next: AiReportPreferenceInput) => void;
  onSave: () => void;
  loading: boolean;
  t: (key: string, values?: Record<string, unknown>) => string;
}) {
  const focusOptions: ReportFocusOption[] = ['weight', 'bodyFat', 'wellness', 'muscle', 'habit'];
  const styleOptions: ReportAdviceStyleOption[] = ['simple', 'concrete', 'motivational'];
  const voiceModeOptions: ReportVoiceModeOption[] = ['gentle', 'balanced', 'sharp'];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>{t('report.preference.title')}</Text>

          <Text style={styles.modalLabel}>{t('report.preference.question.focus')}</Text>
          <View style={styles.modalOptionRow}>
            {focusOptions.map((option) => {
              const selected = preference.focusAreas.includes(option);
              return (
                <TouchableOpacity
                  key={option}
                  style={[styles.modalOptionChip, selected && styles.modalOptionChipActive]}
                  onPress={() => onChange({ ...preference, focusAreas: [option] })}
                >
                  <Text style={[styles.modalOptionText, selected && styles.modalOptionTextActive]}>
                    {t(`report.preference.focus.${option}`)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.modalLabel}>{t('report.preference.question.style')}</Text>
          <View style={styles.modalOptionRow}>
            {styleOptions.map((option) => (
              <TouchableOpacity
                key={option}
                style={[styles.modalOptionChip, preference.adviceStyle === option && styles.modalOptionChipActive]}
                onPress={() => onChange({ ...preference, adviceStyle: option })}
              >
                <Text
                  style={[
                    styles.modalOptionText,
                    preference.adviceStyle === option && styles.modalOptionTextActive,
                  ]}
                >
                  {t(`report.preference.style.${option}`)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.modalLabel}>{t('report.preference.question.voiceMode')}</Text>
          <View style={styles.modalOptionRow}>
            {voiceModeOptions.map((option) => (
              <TouchableOpacity
                key={option}
                style={[styles.modalOptionChip, (preference.voiceMode ?? 'balanced') === option && styles.modalOptionChipActive]}
                onPress={() => onChange({ ...preference, voiceMode: option })}
              >
                <Text
                  style={[
                    styles.modalOptionText,
                    (preference.voiceMode ?? 'balanced') === option && styles.modalOptionTextActive,
                  ]}
                >
                  {t(`report.preference.voiceMode.${option}`)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {(preference.voiceMode ?? 'balanced') === 'sharp' ? (
            <Text style={styles.modalWarningText}>{t('report.preference.voiceMode.sharpNotice')}</Text>
          ) : null}

          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.modalActionGhost} onPress={onClose} disabled={loading}>
              <Text style={styles.modalActionGhostText}>{t('common.close')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalActionPrimary} onPress={onSave} disabled={loading}>
              {loading ? <ActivityIndicator color={colors.accentInk} /> : <Text style={styles.modalActionPrimaryText}>{t('common.done')}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

type CalendarMode = 'daily' | 'weekly';

function ReportCalendar({
  locale,
  month,
  mode,
  recordedDates,
  selectedDate,
  selectedWeekAnchor,
  weekLogCounts,
  minWeekDays,
  onSelectDate,
  onSelectWeek,
  onPrevMonth,
  onNextMonth,
}: {
  locale: string;
  month: DateTime;
  mode: CalendarMode;
  recordedDates: Set<string>;
  selectedDate: string | null;
  selectedWeekAnchor: string | null;
  weekLogCounts: Map<string, number>;
  minWeekDays: number;
  onSelectDate: (isoDate: string) => void;
  onSelectWeek: (isoDate: string) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}) {
  const weeks = useMemo(() => buildCalendarWeeks(month, locale), [locale, month]);
  const weekdays = useMemo(() => buildWeekdayLabels(month, locale), [locale, month]);
  const selectedWeekStart = selectedWeekAnchor
    ? DateTime.fromISO(selectedWeekAnchor).setLocale(locale).startOf('week')
    : null;

  return (
    <View style={styles.calendarContainer}>
      <View style={styles.calendarHeader}>
        <TouchableOpacity style={styles.calendarNavButton} onPress={onPrevMonth}>
          <Text style={styles.calendarNavText}>{'<'}</Text>
        </TouchableOpacity>
        <Text style={styles.calendarMonthLabel}>{formatCalendarMonth(month, locale)}</Text>
        <TouchableOpacity style={styles.calendarNavButton} onPress={onNextMonth}>
          <Text style={styles.calendarNavText}>{'>'}</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.calendarWeekdays}>
        {weekdays.map((label, index) => (
          <Text key={`${label}-${index}`} style={styles.calendarWeekday}>
            {label}
          </Text>
        ))}
      </View>
      <View style={styles.calendarGrid}>
        {weeks.map((week, rowIndex) => {
          const weekStart = week[0].setLocale(locale).startOf('week');
          const weekKey = toISODateSafe(weekStart);
          const weekLoggedCount = weekLogCounts.get(weekKey) ?? 0;
          const weekEligible = mode === 'weekly' ? weekLoggedCount >= minWeekDays : true;
          const isSelectedWeek = selectedWeekStart != null ? weekStart.hasSame(selectedWeekStart, 'week') : false;
          return (
            <View
              key={`week-${rowIndex}`}
              style={[
                styles.calendarRow,
                mode === 'weekly' && isSelectedWeek && weekEligible && styles.calendarRowSelected,
                mode === 'weekly' && !weekEligible && styles.calendarRowDisabled,
              ]}
            >
              {week.map((day) => {
                const isoDate = toISODateSafe(day);
                const isOutside = !day.hasSame(month, 'month');
                const isRecorded = recordedDates.has(isoDate);
                const isSelected = mode === 'daily' && selectedDate === isoDate;
                const isInSelectedWeek = mode === 'weekly' && isSelectedWeek && weekEligible;
                const isDisabled = isOutside || (mode === 'daily' ? !isRecorded : !weekEligible);
                const handlePress = () => {
                  if (mode === 'daily') {
                    onSelectDate(isoDate);
                  } else {
                    onSelectWeek(isoDate);
                  }
                };
                return (
                  <TouchableOpacity
                    key={isoDate}
                    style={styles.calendarCell}
                    onPress={handlePress}
                    disabled={isDisabled}
                  >
                    <View
                      style={[
                        styles.calendarDay,
                        isOutside && styles.calendarDayOutside,
                        isRecorded && styles.calendarDayRecorded,
                        isSelected && styles.calendarDaySelected,
                        isInSelectedWeek && styles.calendarDayWeekSelected,
                        isDisabled && styles.calendarDayDisabled,
                      ]}
                    >
                      <Text
                        style={[
                          styles.calendarDayLabel,
                          (isOutside || (mode === 'daily' && !isRecorded)) && styles.calendarDayLabelMuted,
                          (isSelected || isInSelectedWeek) && styles.calendarDayLabelSelected,
                        ]}
                      >
                        {day.day}
                      </Text>
                      {isRecorded ? <View style={styles.calendarDot} /> : null}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          );
        })}
      </View>
    </View>
  );
}

function MonthPicker({
  locale,
  year,
  month,
  onYearChange,
  onMonthChange,
}: {
  locale: string;
  year: number;
  month: number;
  onYearChange: (value: number) => void;
  onMonthChange: (value: number) => void;
}) {
  const months = useMemo(
    () =>
      Array.from({ length: 12 }, (_, index) => {
        const dt = DateTime.fromObject({ year, month: index + 1, day: 1 }).setLocale(locale);
        const label = locale.startsWith('ja') ? `${dt.month}月` : dt.toFormat('MMM');
        return { value: index + 1, label };
      }),
    [locale, year],
  );

  return (
    <View style={styles.monthPicker}>
      <View style={styles.calendarHeader}>
        <TouchableOpacity style={styles.calendarNavButton} onPress={() => onYearChange(year - 1)}>
          <Text style={styles.calendarNavText}>{'<'}</Text>
        </TouchableOpacity>
        <Text style={styles.calendarMonthLabel}>{year}</Text>
        <TouchableOpacity style={styles.calendarNavButton} onPress={() => onYearChange(year + 1)}>
          <Text style={styles.calendarNavText}>{'>'}</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.monthGrid}>
        {months.map((item) => {
          const isSelected = item.value === month;
          return (
            <TouchableOpacity
              key={`${item.value}-${year}`}
              style={styles.monthCell}
              onPress={() => onMonthChange(item.value)}
            >
              <View style={[styles.monthChip, isSelected && styles.monthChipSelected]}>
                <Text style={[styles.monthLabel, isSelected && styles.monthLabelSelected]}>{item.label}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function ScoreRing({
  score,
  label,
  emoji,
  size = 118,
}: {
  score: number;
  label: string;
  emoji: string;
  size?: number;
}) {
  const strokeWidth = Math.max(10, Math.round(size * 0.085));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = clamp(score / 100, 0, 1);
  const dashOffset = circumference * (1 - progress);

  return (
    <View style={styles.scoreRing}>
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor={colors.accent} />
            <Stop offset="100%" stopColor={colors.ringFat} />
          </LinearGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={colors.ringInactive} strokeWidth={strokeWidth} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="url(#scoreGradient)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashOffset}
          fill="none"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.scoreRingCenter}>
        <Text style={styles.scoreRingValue}>{Math.round(score)}</Text>
        <Text style={styles.scoreRingLabel}>
          {label} {emoji}
        </Text>
      </View>
    </View>
  );
}

function TrendLineChart({
  points,
  target,
  targetLabel,
  axisLabelX,
  axisLabelY,
}: {
  points: ChartPoint[];
  target: number;
  targetLabel: string;
  axisLabelX: string;
  axisLabelY: string;
}) {
  const [width, setWidth] = useState(0);
  const height = 140;
  const padding = 12;
  const handleLayout = (event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  };

  const chart = useMemo(() => {
    if (width === 0 || points.length === 0) {
      return null;
    }
    const maxValue = Math.max(target ?? 0, ...points.map((point) => point.value), 1);
    const usableWidth = Math.max(1, width - padding * 2);
    const usableHeight = Math.max(1, height - padding * 2);
    const maxIndex = Math.max(points.length - 1, 1);
    const data = points.map((point, index) => ({
      x: padding + (usableWidth * index) / maxIndex,
      y: height - padding - (point.value / maxValue) * usableHeight,
    }));

    const linePath = line<{ x: number; y: number }>()
      .x((d) => d.x)
      .y((d) => d.y)
      .curve(curveMonotoneX)(data);

    const areaPath = area<{ x: number; y: number }>()
      .x((d) => d.x)
      .y0(height - padding)
      .y1((d) => d.y)
      .curve(curveMonotoneX)(data);

    const targetY = target ? height - padding - (target / maxValue) * usableHeight : null;
    const gridYs = [0.25, 0.5, 0.75].map((ratio) => height - padding - usableHeight * ratio);

    return {
      data,
      linePath: linePath ?? '',
      areaPath: areaPath ?? '',
      targetY,
      gridYs,
      lastPoint: data[data.length - 1] ?? null,
    };
  }, [width, points, target]);

  return (
    <View style={styles.trendChart} onLayout={handleLayout}>
      {chart ? (
        <>
          <Svg width={width} height={height}>
            <Defs>
              <LinearGradient id="trendGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <Stop offset="0%" stopColor={`${colors.accent}3A`} />
                <Stop offset="100%" stopColor={`${colors.accent}00`} />
              </LinearGradient>
            </Defs>
            {chart.gridYs.map((gridY, index) => (
              <Line
                key={`trend-grid-${index}`}
                x1={padding}
                y1={gridY}
                x2={width - padding}
                y2={gridY}
                stroke="rgba(17,19,24,0.09)"
                strokeWidth={1}
              />
            ))}
            {chart.targetY !== null ? (
              <Line
                x1={padding}
                y1={chart.targetY}
                x2={width - padding}
                y2={chart.targetY}
                stroke={colors.accentSage}
                strokeWidth={1.4}
                strokeDasharray="6 4"
              />
            ) : null}
            {chart.targetY !== null ? (
              <SvgText
                x={width - padding - 2}
                y={Math.max(padding + 12, chart.targetY - 6)}
                fill={colors.accentSage}
                fontSize={11}
                fontWeight="700"
                textAnchor="end"
              >
                {targetLabel}
              </SvgText>
            ) : null}
            {chart.areaPath ? <Path d={chart.areaPath} fill="url(#trendGradient)" /> : null}
            {chart.linePath ? (
              <Path
                d={chart.linePath}
                stroke={`${colors.accent}44`}
                strokeWidth={7}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            ) : null}
            {chart.linePath ? (
              <Path
                d={chart.linePath}
                stroke={colors.accent}
                strokeWidth={3.4}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            ) : null}
            {chart.lastPoint ? (
              <Circle
                cx={chart.lastPoint.x}
                cy={chart.lastPoint.y}
                r={4.5}
                fill={colors.accent}
                stroke="rgba(255,255,255,0.9)"
                strokeWidth={2}
              />
            ) : null}
          </Svg>
          <View style={styles.trendAxisRow}>
            <Text style={styles.trendAxisLabel}>{axisLabelY}</Text>
            <Text style={styles.trendAxisLabel}>{axisLabelX}</Text>
          </View>
        </>
      ) : null}
    </View>
  );
}

function MacroDonut({ macros, totalCalories }: { macros: MacroStat[]; totalCalories: number }) {
  const size = 140;
  const radius = size / 2;
  const thickness = 16;
  const total = macros.reduce((sum, macro) => sum + Math.max(macro.actual, 0), 0);
  const safeTotal = total > 0 ? total : 1;
  const arcGenerator = arc<any>().innerRadius(radius - thickness).outerRadius(radius);
  let startAngle = -Math.PI / 2;
  const segments = macros.map((macro) => {
    const value = Math.max(macro.actual, 0);
    const slice = (value / safeTotal) * Math.PI * 2;
    const endAngle = startAngle + slice;
    const path = arcGenerator({ startAngle, endAngle });
    const segment = {
      path,
      color: MACRO_META[macro.key].color,
    };
    startAngle = endAngle;
    return segment;
  });

  return (
    <View style={styles.macroDonut}>
      <Svg width={size} height={size}>
        <G x={radius} y={radius}>
          {total === 0 ? (
            <Circle cx={0} cy={0} r={radius - thickness / 2} stroke={colors.border} strokeWidth={thickness} fill="none" />
          ) : (
            segments.map((segment, index) =>
              segment.path ? <Path key={`macro-${index}`} d={segment.path} fill={segment.color} /> : null,
            )
          )}
        </G>
      </Svg>
      <View style={styles.macroDonutCenter}>
        <Text style={styles.macroDonutValue}>{Math.round(totalCalories)}</Text>
        <Text style={styles.macroDonutLabel}>kcal</Text>
      </View>
    </View>
  );
}

function MealTimingStack({ entries }: { entries: MealPeriodBreakdown[] }) {
  const total = entries.reduce((sum, entry) => sum + entry.value, 0);
  return (
    <View style={styles.timingContainer}>
      <View style={styles.timingBar}>
        {entries.map((entry) => (
          <View
            key={entry.key}
            style={[
              styles.timingSegment,
              {
                flex: total > 0 ? entry.value : 1,
                backgroundColor: MEAL_PERIOD_META[entry.key].color,
              },
            ]}
          />
        ))}
      </View>
      <View style={styles.timingLegend}>
        {entries.map((entry) => (
          <View key={`${entry.key}-legend`} style={styles.timingLegendRow}>
            <View style={[styles.timingDot, { backgroundColor: MEAL_PERIOD_META[entry.key].color }]} />
            <Text style={styles.timingLabel}>
              {MEAL_PERIOD_META[entry.key].emoji} {entry.label}
            </Text>
            <Text style={styles.timingValue}>{total > 0 ? `${entry.percent}%` : '-'}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function buildCalendarWeeks(month: DateTime, locale: string) {
  const anchor = month.setLocale(locale).startOf('month');
  const start = anchor.startOf('week');
  const end = anchor.endOf('month').endOf('week');
  const weeks: DateTime[][] = [];
  let cursor = start;
  while (cursor <= end) {
    const week: DateTime[] = [];
    for (let day = 0; day < 7; day += 1) {
      week.push(cursor);
      cursor = cursor.plus({ days: 1 });
    }
    weeks.push(week);
  }
  return weeks;
}

function buildWeekdayLabels(month: DateTime, locale: string) {
  const start = month.setLocale(locale).startOf('week');
  return Array.from({ length: 7 }, (_, index) => formatWeekdayLabel(start.plus({ days: index }), locale));
}

function formatCalendarMonth(month: DateTime, locale: string) {
  return month.setLocale(locale).toFormat(locale.startsWith('ja') ? 'yyyy年L月' : 'LLLL yyyy');
}

function formatWeekdayLabel(date: DateTime, locale: string) {
  const label = date.setLocale(locale).toFormat('ccc');
  if (label && label !== 'null' && label !== 'Invalid DateTime') {
    return label;
  }
  const fallback = locale.startsWith('ja')
    ? ['月', '火', '水', '木', '金', '土', '日']
    : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return fallback[date.weekday - 1] ?? '';
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  shareRenderTarget: {
    position: 'absolute',
    left: -10000,
    top: -10000,
    opacity: 0,
  },
  header: {
    gap: 6,
  },
  title: {
    ...textStyles.titleLarge,
  },
  subtitle: {
    ...textStyles.caption,
  },
  segmentGroup: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    padding: 6,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 14,
    alignItems: 'center',
  },
  segmentButtonActive: {
    backgroundColor: colors.accent,
  },
  segmentButtonDisabled: {
    opacity: 0.6,
  },
  segmentLabel: {
    ...textStyles.caption,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  segmentLabelActive: {
    color: colors.accentInk,
  },
  periodHint: {
    ...textStyles.caption,
    color: colors.textMuted,
  },
  rangeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rangeLabel: {
    ...textStyles.caption,
    color: colors.textMuted,
  },
  rangeValue: {
    ...textStyles.caption,
    fontWeight: '600',
  },
  preferenceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  preferenceEditButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
  },
  preferenceEditLabel: {
    ...textStyles.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  preferenceSummary: {
    ...textStyles.caption,
    color: colors.textPrimary,
  },
  voiceModeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  voiceModeChip: {
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  voiceModeChipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  voiceModeChipText: {
    ...textStyles.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  voiceModeChipTextActive: {
    color: colors.accentInk,
  },
  preferenceNotice: {
    ...textStyles.caption,
    color: colors.error,
    marginTop: spacing.xs,
  },
  tokenNote: {
    ...textStyles.caption,
    color: colors.textMuted,
    textAlign: 'center',
  },
  loadingInline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  loadingInlineText: {
    ...textStyles.caption,
    color: colors.textMuted,
  },
  card: {
    marginTop: spacing.sm,
  },
  summaryCardContent: {
    position: 'relative',
    overflow: 'hidden',
  },
  summaryCardGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 180,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  cardTitle: {
    ...textStyles.titleMedium,
    marginBottom: spacing.sm,
    color: '#0E1218',
    fontWeight: '800',
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.1,
    textTransform: 'none',
  },
  emptyTitle: {
    ...textStyles.titleMedium,
    marginBottom: spacing.sm,
  },
  emptyBody: {
    ...textStyles.caption,
  },
  historySection: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  historyTitle: {
    ...textStyles.overline,
    letterSpacing: 1.1,
    color: colors.textSecondary,
  },
  historyList: {
    gap: spacing.sm,
  },
  historyItem: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 16,
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: 6,
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  historyRange: {
    ...textStyles.caption,
    fontWeight: '600',
    color: colors.textPrimary,
    flex: 1,
  },
  historyPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  historyPillText: {
    ...textStyles.caption,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  historyHeadline: {
    ...textStyles.caption,
    color: colors.textPrimary,
  },
  historyMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  historyMetaText: {
    ...textStyles.caption,
    color: colors.textMuted,
  },
  historyAction: {
    ...textStyles.caption,
    color: colors.accent,
    fontWeight: '600',
    marginLeft: 'auto',
  },
  summaryHero: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
  },
  heroStats: {
    flex: 1,
    gap: spacing.sm,
  },
  heroAchievement: {
    backgroundColor: `${colors.accentSoft}66`,
    borderRadius: 16,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(245,178,37,0.4)',
    gap: 2,
  },
  heroAchievementLabel: {
    ...textStyles.caption,
    color: colors.textSecondary,
    fontWeight: '700',
  },
  heroAchievementValue: {
    ...textStyles.heading,
    fontSize: 28,
    lineHeight: 32,
    color: colors.accentInk,
    fontWeight: '800',
  },
  heroStat: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 14,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: 4,
  },
  heroStatLabel: {
    ...textStyles.caption,
    color: colors.textMuted,
    fontWeight: '600',
  },
  heroStatValue: {
    ...textStyles.titleMedium,
    color: colors.textPrimary,
  },
  summaryHeadline: {
    ...textStyles.titleMedium,
  },
  summaryGeneratedDate: {
    ...textStyles.caption,
    marginTop: -spacing.xs,
    marginBottom: spacing.sm,
    color: colors.textMuted,
    fontWeight: '600',
  },
  scoreRing: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreRingCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreRingValue: {
    ...textStyles.titleLarge,
    fontSize: 26,
  },
  scoreRingLabel: {
    ...textStyles.caption,
    color: colors.textMuted,
  },
  highlightRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  highlightChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 999,
  },
  highlightText: {
    ...textStyles.caption,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  summaryActionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  summaryActionButton: {
    flex: 1,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryActionButtonPrimary: {
    backgroundColor: colors.accent,
    borderColor: 'rgba(245,178,37,0.7)',
  },
  summaryCollapseButton: {
    width: 44,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surfaceStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryCollapseText: {
    ...textStyles.titleMedium,
    color: colors.textSecondary,
    lineHeight: 18,
    fontWeight: '700',
  },
  summaryActionText: {
    ...textStyles.caption,
    color: colors.textSecondary,
    fontWeight: '700',
  },
  summaryActionTextStrong: {
    color: colors.accentInk,
  },
  smartProActionSecondary: {
    minHeight: 44,
  },
  detailsPromptButton: {
    marginTop: spacing.sm,
  },
  feedbackSection: {
    marginTop: spacing.md,
    gap: spacing.xs,
  },
  feedbackTitle: {
    ...textStyles.caption,
    color: colors.textMuted,
    fontWeight: '700',
  },
  feedbackChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  feedbackChip: {
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  feedbackChipSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  feedbackChipText: {
    ...textStyles.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  feedbackChipTextSelected: {
    color: colors.accentInk,
  },
  feedbackHint: {
    ...textStyles.caption,
    color: colors.textMuted,
  },
  calendarHint: {
    ...textStyles.caption,
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  calendarEmpty: {
    ...textStyles.caption,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  calendarContainer: {
    gap: spacing.sm,
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  calendarNavButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: colors.surfaceMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  calendarNavText: {
    ...textStyles.caption,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  calendarMonthLabel: {
    ...textStyles.titleMedium,
  },
  calendarWeekdays: {
    flexDirection: 'row',
  },
  calendarWeekday: {
    ...textStyles.caption,
    color: colors.textMuted,
    textAlign: 'center',
    flex: 1,
  },
  calendarGrid: {
    gap: spacing.xs,
  },
  calendarRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  calendarRowSelected: {
    backgroundColor: `${colors.accentSoft}66`,
    borderRadius: 16,
    padding: 2,
  },
  calendarRowDisabled: {
    opacity: 0.5,
  },
  calendarCell: {
    flex: 1,
  },
  calendarDay: {
    aspectRatio: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  calendarDayOutside: {
    opacity: 0.35,
  },
  calendarDayRecorded: {
    backgroundColor: colors.accentSoft,
  },
  calendarDaySelected: {
    backgroundColor: colors.accent,
  },
  calendarDayWeekSelected: {
    backgroundColor: `${colors.accentSoft}AA`,
  },
  calendarDayDisabled: {
    opacity: 0.5,
  },
  calendarDayLabel: {
    ...textStyles.caption,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  calendarDayLabelMuted: {
    color: colors.textMuted,
  },
  calendarDayLabelSelected: {
    color: colors.accentInk,
  },
  calendarDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 2,
    backgroundColor: colors.accent,
  },
  monthPicker: {
    gap: spacing.md,
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  monthCell: {
    flexBasis: '30%',
    flexGrow: 1,
  },
  monthChip: {
    paddingVertical: spacing.sm,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  monthChipSelected: {
    backgroundColor: colors.accent,
  },
  monthLabel: {
    ...textStyles.caption,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  monthLabelSelected: {
    color: colors.accentInk,
  },
  trendChart: {
    minHeight: 140,
    borderRadius: 14,
    backgroundColor: `${colors.surfaceMuted}`,
    paddingVertical: spacing.xs,
  },
  trendAxisRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  trendAxisLabel: {
    ...textStyles.caption,
    color: colors.textMuted,
  },
  trendNote: {
    ...textStyles.caption,
    color: colors.accentSage,
    fontWeight: '700',
    marginTop: spacing.sm,
  },
  comparisonScoreDelta: {
    ...textStyles.caption,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  comparisonList: {
    gap: spacing.sm,
  },
  comparisonItem: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 14,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: 4,
  },
  comparisonItemTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  comparisonLabel: {
    ...textStyles.caption,
    color: colors.textSecondary,
    flex: 1,
  },
  comparisonValue: {
    ...textStyles.caption,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  comparisonDelta: {
    ...textStyles.caption,
    fontWeight: '700',
  },
  comparisonDeltaGood: {
    color: colors.success,
  },
  comparisonDeltaBad: {
    color: colors.error,
  },
  macroWrap: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  macroWrapCompact: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  macroDonut: {
    width: 140,
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
  },
  macroDonutCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  macroDonutValue: {
    ...textStyles.titleMedium,
    fontWeight: '700',
  },
  macroDonutLabel: {
    ...textStyles.caption,
    color: colors.textMuted,
  },
  macroLegend: {
    flex: 1,
    gap: spacing.md,
    justifyContent: 'center',
    alignSelf: 'center',
    minWidth: 210,
  },
  macroLegendItem: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    gap: spacing.sm,
  },
  macroLegendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  macroDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
  },
  macroLegendText: {
    ...textStyles.caption,
    color: colors.textSecondary,
    flex: 1,
  },
  macroLegendValue: {
    ...textStyles.caption,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  macroProgressTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(17,19,24,0.12)',
    overflow: 'hidden',
  },
  macroProgressFill: {
    height: '100%',
    borderRadius: 999,
  },
  macroRemainText: {
    ...textStyles.caption,
    color: colors.textMuted,
    fontWeight: '600',
  },
  timingContainer: {
    gap: spacing.md,
  },
  timingBar: {
    flexDirection: 'row',
    height: 14,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 999,
    overflow: 'hidden',
  },
  timingSegment: {
    height: '100%',
  },
  timingLegend: {
    gap: spacing.sm,
  },
  timingLegendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  timingDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
  },
  timingLabel: {
    ...textStyles.caption,
    color: colors.textSecondary,
    flex: 1,
  },
  timingValue: {
    ...textStyles.caption,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  metricItem: {
    flexBasis: '47%',
    backgroundColor: colors.surfaceMuted,
    padding: spacing.md,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: 4,
  },
  metricItemCompact: {
    flexBasis: '100%',
  },
  metricLabel: {
    ...textStyles.caption,
    color: colors.textMuted,
  },
  metricValue: {
    ...textStyles.titleMedium,
  },
  metricNote: {
    ...textStyles.caption,
  },
  ingredientList: {
    gap: spacing.sm,
  },
  ingredientItem: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 16,
    padding: spacing.md,
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  ingredientName: {
    ...textStyles.titleMedium,
  },
  ingredientReason: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  adviceList: {
    gap: spacing.sm,
  },
  adviceItem: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 16,
    padding: spacing.md,
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  adviceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  priorityBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  priorityBadgeHigh: {
    backgroundColor: `${colors.error}26`,
    borderColor: `${colors.error}88`,
  },
  priorityBadgeMedium: {
    backgroundColor: `${colors.accent}2E`,
    borderColor: `${colors.accent}88`,
  },
  priorityBadgeLow: {
    backgroundColor: `${colors.success}24`,
    borderColor: `${colors.success}88`,
  },
  priorityText: {
    ...textStyles.caption,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  priorityTextHigh: {
    color: '#A62020',
  },
  priorityTextMedium: {
    color: '#8A5B00',
  },
  priorityTextLow: {
    color: '#0D6F4D',
  },
  adviceTitle: {
    ...textStyles.titleMedium,
    flexShrink: 1,
    fontSize: 17,
    lineHeight: 23,
  },
  adviceDetail: {
    ...textStyles.caption,
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 21,
  },
  adviceDetailEmphasis: {
    fontWeight: '800',
    color: colors.textPrimary,
  },
  effectOverlay: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    top: spacing.xl * 2,
    backgroundColor: colors.surfaceStrong,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    shadowColor: colors.shadow,
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  effectEmoji: {
    fontSize: 24,
  },
  effectMessage: {
    ...textStyles.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(17, 19, 24, 0.36)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    borderRadius: 20,
    backgroundColor: colors.surfaceStrong,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  modalTitle: {
    ...textStyles.titleMedium,
    fontWeight: '700',
  },
  modalLabel: {
    ...textStyles.caption,
    color: colors.textMuted,
    fontWeight: '700',
  },
  modalOptionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  modalOptionChip: {
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  modalOptionChipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  modalOptionText: {
    ...textStyles.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  modalOptionTextActive: {
    color: colors.accentInk,
  },
  modalWarningText: {
    ...textStyles.caption,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  modalActionGhost: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceMuted,
  },
  modalActionGhostText: {
    ...textStyles.caption,
    color: colors.textSecondary,
    fontWeight: '700',
  },
  modalActionPrimary: {
    borderRadius: 10,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.accent,
    minWidth: 74,
    alignItems: 'center',
  },
  modalActionPrimaryText: {
    ...textStyles.caption,
    color: colors.accentInk,
    fontWeight: '700',
  },
});
