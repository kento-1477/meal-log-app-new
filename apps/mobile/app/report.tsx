import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Alert,
  AppState,
  Easing,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DateTime } from 'luxon';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AiReportAdvice,
  AiReportComparisonMetric,
  AiReportPreferenceInput,
  AiReportPeriod,
  AiReportResponse,
  AiReportRequestStatus,
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
import { useTranslation } from '@/i18n';
import { useSessionStore } from '@/store/session';
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
type ReportScoreEffect = 'celebration' | 'encourage' | 'neutral';

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
    return { period: fallback as DashboardPeriod, range: undefined };
  }
  const from = DateTime.fromISO(report.range.from).toISODate() ?? report.range.from.slice(0, 10);
  const toDate = DateTime.fromISO(report.range.to).minus({ days: 1 });
  const to = toDate.toISODate() ?? report.range.to.slice(0, 10);
  return { period: 'custom' as DashboardPeriod, range: { from, to } };
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
};
const SHARE_IMAGE_WIDTH = 1080;
const SHARE_IMAGE_HEIGHT = 1350;

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

function highlightTint(index: number) {
  return HIGHLIGHT_TONES[index % HIGHLIGHT_TONES.length];
}

export default function ReportScreen() {
  const { t, locale } = useTranslation();
  const setUsage = useSessionStore((state) => state.setUsage);
  const userId = useSessionStore((state) => state.user?.id ?? null);
  const queryClient = useQueryClient();
  const today = useMemo(() => DateTime.now().startOf('day'), []);
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
  const scoreEffectOpacity = useRef(new Animated.Value(0)).current;
  const playedEffectReportKeyRef = useRef<string | null>(null);
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
          Alert.alert(t('report.errorTitle'), activeItem.errorMessage ?? t('report.errorFallback'));
          setActiveRequestId(null);
        } else if (activeItem.status === 'canceled') {
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
      Alert.alert(t('report.errorTitle'), request.errorMessage ?? t('report.errorFallback'));
      setActiveRequestId(null);
      return;
    }

    if (request.status === 'canceled') {
      Alert.alert(t('report.errorTitle'), t('report.canceledMessage'));
      setActiveRequestId(null);
    }
  }, [historyStorageKey, reportRequestQuery.data, setUsage, t]);

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
  const streakDays = streakQuery.data?.streak.current ?? report?.uiMeta?.streakDays ?? 0;
  const showWeeklyPrompt = period === 'daily' && streakDays >= 7;

  useEffect(() => {
    setDetailsExpanded(false);
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
  const updatePreferenceMutation = useMutation({
    mutationFn: (payload: AiReportPreferenceInput) => updateAiReportPreference(payload),
    onSuccess: (response) => {
      setDraftPreference(response.preference);
      queryClient.setQueryData(['reportPreference', userId ?? 'anon'], {
        ok: true,
        preference: response.preference,
        configured: true,
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
  const shareHeadlineLines = useMemo(
    () => (report ? wrapShareLines(report.summary.headline, 24, 3) : []),
    [report],
  );
  const shareHighlights = useMemo(
    () =>
      report
        ? report.summary.highlights
            .slice(0, 3)
            .map((item) => wrapShareLines(item, 30, 1).join(''))
        : [],
    [report],
  );
  const shareComparisonMetrics = useMemo(
    () => (report?.comparison?.metrics ?? []).slice(0, 3),
    [report],
  );
  const isGenerating =
    createReportMutation.isLoading ||
    activeRequestStatus === 'queued' ||
    activeRequestStatus === 'processing';
  const canGenerate =
    Boolean(selectedRange) &&
    (period === 'daily' ? dailyEligible : period === 'weekly' ? weeklyEligible : monthlyEligible);
  const hasHistory = reportHistory.length > 0;
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
              {t(`report.preference.style.${activePreference.adviceStyle}`)}
            </Text>
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
            <GlassCard style={styles.card}>
                <Text style={styles.cardTitle}>✨ {t('report.section.summary')}</Text>
                <View style={styles.summaryHero}>
                  <ScoreRing
                    score={Math.round(report.summary.score)}
                    label={t('report.scoreLabel')}
                    emoji={scoreEmoji(report.summary.score)}
                  />
                  <View style={styles.heroStats}>
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
                      style={[styles.summaryActionButton, styles.summaryActionButtonMuted]}
                      onPress={() => setDetailsExpanded(false)}
                    >
                      <Text style={styles.summaryActionText}>{t('report.hideDetails')}</Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity
                    style={[styles.summaryActionButton, styles.summaryActionButtonPrimary]}
                    onPress={handleShareReport}
                  >
                    <Text style={[styles.summaryActionText, styles.summaryActionTextStrong]}>{t('report.shareButton')}</Text>
                  </TouchableOpacity>
                </View>
            </GlassCard>
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
                <GlassCard style={styles.card}>
                  <Text style={styles.cardTitle}>🧭 {t('report.weeklyPrompt.title')}</Text>
                  <Text style={styles.emptyBody}>{t('report.weeklyPrompt.body', { days: streakDays })}</Text>
                  <TouchableOpacity style={styles.summaryActionButton} onPress={() => setPeriod('weekly')}>
                    <Text style={styles.summaryActionText}>{t('report.weeklyPrompt.cta')}</Text>
                  </TouchableOpacity>
                </GlassCard>
              ) : null}

              {!detailsExpanded ? (
                <GlassCard style={styles.card}>
                  <Text style={styles.emptyBody}>{t('report.detailsCollapsed')}</Text>
                  <TouchableOpacity
                    style={[styles.summaryActionButton, styles.detailsPromptButton, styles.summaryActionButtonPrimary]}
                    onPress={() => setDetailsExpanded(true)}
                  >
                    <Text style={[styles.summaryActionText, styles.summaryActionTextStrong]}>{t('report.showDetails')}</Text>
                  </TouchableOpacity>
                </GlassCard>
              ) : (
                <>
                  {report.comparison?.metrics?.length ? (
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
                  ) : null}

                  <GlassCard style={styles.card}>
                    <Text style={styles.cardTitle}>📈 {t('report.section.trend')}</Text>
                    {dashboardSummary.isLoading && !dashboard ? (
                      <ActivityIndicator color={colors.accent} />
                    ) : dashboard?.calories.points.length ? (
                      <TrendLineChart
                        points={dashboard.calories.points}
                        target={dashboard.calories.targetLine}
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

                  <GlassCard style={styles.card}>
                    <Text style={styles.cardTitle}>🥗 {t('report.section.macros')}</Text>
                    {dashboard ? (
                      <View style={styles.macroWrap}>
                        <MacroDonut macros={dashboard.macros} totalCalories={dashboard.summary.macros.total.calories} />
                        <View style={styles.macroLegend}>
                          {dashboard.macros.map((macro) => (
                            <View key={macro.key} style={styles.macroLegendRow}>
                              <View style={[styles.macroDot, { backgroundColor: MACRO_META[macro.key].color }]} />
                              <Text style={styles.macroLegendText}>
                                {MACRO_META[macro.key].emoji} {macro.label}
                              </Text>
                              <Text style={styles.macroLegendValue}>
                                {Math.round(macro.actual)} / {Math.round(macro.target)}g
                              </Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    ) : (
                      <Text style={styles.emptyBody}>{t('dashboard.chart.empty')}</Text>
                    )}
                  </GlassCard>

                  <GlassCard style={styles.card}>
                    <Text style={styles.cardTitle}>🍽️ {t('report.section.mealTiming')}</Text>
                    {dashboard ? (
                      <MealTimingStack entries={dashboard.calories.mealPeriodBreakdown} />
                    ) : (
                      <Text style={styles.emptyBody}>{t('dashboard.chart.empty')}</Text>
                    )}
                  </GlassCard>

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

                  <GlassCard style={styles.card}>
                    <Text style={styles.cardTitle}>💡 {t('report.section.advice')}</Text>
                    <View style={styles.adviceList}>
                      {report.advice.map((advice, index) => (
                        <View key={`${advice.title}-${index}`} style={styles.adviceItem}>
                          <View style={styles.adviceHeader}>
                            <View style={[styles.priorityBadge, priorityBadgeStyle(advice.priority)]}>
                              <Text style={styles.priorityText}>{formatPriority(advice.priority)}</Text>
                            </View>
                            <Text style={styles.adviceTitle}>{advice.title}</Text>
                          </View>
                          <Text style={styles.adviceDetail}>{advice.detail}</Text>
                        </View>
                      ))}
                    </View>
                  </GlassCard>
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
                  <Stop offset="0" stopColor="#FFF4DE" />
                  <Stop offset="0.5" stopColor="#EFF8FF" />
                  <Stop offset="1" stopColor="#EFFFF2" />
                </LinearGradient>
              </Defs>
              <Rect x={0} y={0} width={SHARE_IMAGE_WIDTH} height={SHARE_IMAGE_HEIGHT} fill="url(#shareBg)" />
              <Rect
                x={56}
                y={56}
                width={SHARE_IMAGE_WIDTH - 112}
                height={SHARE_IMAGE_HEIGHT - 112}
                rx={42}
                fill="rgba(255,255,255,0.95)"
                stroke="rgba(31,36,44,0.08)"
                strokeWidth={2}
              />

              <SvgText x={96} y={128} fill={colors.textPrimary} fontSize={52} fontWeight="700">
                {t('report.header')}
              </SvgText>
              <SvgText x={96} y={178} fill={colors.textMuted} fontSize={30}>
                {rangeLabel}
              </SvgText>

              <SvgText x={96} y={300} fill={colors.accent} fontSize={140} fontWeight="800">
                {Math.round(report.summary.score)}
              </SvgText>
              <SvgText x={292} y={285} fill={colors.textSecondary} fontSize={34} fontWeight="600">
                {t('report.scoreLabel')}
              </SvgText>

              <Rect x={96} y={336} width={280} height={112} rx={24} fill="rgba(245,178,37,0.15)" />
              <Rect x={400} y={336} width={280} height={112} rx={24} fill="rgba(116,210,194,0.16)" />
              <Rect x={704} y={336} width={280} height={112} rx={24} fill="rgba(156,124,255,0.14)" />
              <SvgText x={124} y={378} fill={colors.textMuted} fontSize={22}>
                {t('report.stat.averageCalories')}
              </SvgText>
              <SvgText x={124} y={422} fill={colors.textPrimary} fontSize={34} fontWeight="700">
                {summaryStats ? `${summaryStats.averageCalories} kcal` : '--'}
              </SvgText>
              <SvgText x={428} y={378} fill={colors.textMuted} fontSize={22}>
                {t('report.stat.loggedDays')}
              </SvgText>
              <SvgText x={428} y={422} fill={colors.textPrimary} fontSize={34} fontWeight="700">
                {summaryStats ? `${summaryStats.loggedDays}/${summaryStats.totalDays}` : '--'}
              </SvgText>
              <SvgText x={732} y={378} fill={colors.textMuted} fontSize={22}>
                {t('report.streakLabel')}
              </SvgText>
              <SvgText x={732} y={422} fill={colors.textPrimary} fontSize={34} fontWeight="700">
                {`${streakDays}`}
              </SvgText>

              <SvgText x={96} y={510} fill={colors.textSecondary} fontSize={24} fontWeight="700">
                {t('report.section.summary')}
              </SvgText>
              {shareHeadlineLines.map((lineText, index) => (
                <SvgText
                  key={`share-headline-${index}`}
                  x={96}
                  y={566 + index * 50}
                  fill={colors.textPrimary}
                  fontSize={44}
                  fontWeight="700"
                >
                  {lineText}
                </SvgText>
              ))}

              <SvgText x={96} y={740} fill={colors.textSecondary} fontSize={24} fontWeight="700">
                Highlights
              </SvgText>
              {shareHighlights.map((item, index) => (
                <G key={`share-highlight-${index}`}>
                  <Circle cx={108} cy={790 + index * 62} r={7} fill={highlightTint(index)} />
                  <SvgText x={132} y={798 + index * 62} fill={colors.textPrimary} fontSize={30} fontWeight="600">
                    {item}
                  </SvgText>
                </G>
              ))}

              {shareComparisonMetrics.length ? (
                <>
                  <Line x1={96} y1={992} x2={984} y2={992} stroke="rgba(31,36,44,0.12)" strokeWidth={2} />
                  <SvgText x={96} y={1042} fill={colors.textSecondary} fontSize={24} fontWeight="700">
                    {t('report.section.comparison')}
                  </SvgText>
                  {shareComparisonMetrics.map((metric, index) => (
                    <G key={`share-comparison-${metric.key}`}>
                      <SvgText x={96} y={1102 + index * 58} fill={colors.textPrimary} fontSize={28}>
                        {wrapShareLines(metric.label, 26, 1).join('')}
                      </SvgText>
                      <SvgText
                        x={984}
                        y={1102 + index * 58}
                        fill={isMetricImproved(metric) ? colors.success : colors.error}
                        fontSize={28}
                        fontWeight="700"
                        textAnchor="end"
                      >
                        {formatDeltaValue(metric)}
                      </SvgText>
                    </G>
                  ))}
                </>
              ) : null}
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

function ScoreRing({ score, label, emoji }: { score: number; label: string; emoji: string }) {
  const size = 118;
  const strokeWidth = 10;
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
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={colors.border} strokeWidth={strokeWidth} fill="none" />
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
  axisLabelX,
  axisLabelY,
}: {
  points: ChartPoint[];
  target: number;
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

    return {
      data,
      linePath: linePath ?? '',
      areaPath: areaPath ?? '',
      targetY,
    };
  }, [width, points, target]);

  return (
    <View style={styles.trendChart} onLayout={handleLayout}>
      {chart ? (
        <>
          <Svg width={width} height={height}>
            <Defs>
              <LinearGradient id="trendGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <Stop offset="0%" stopColor={`${colors.accent}66`} />
                <Stop offset="100%" stopColor={`${colors.accent}00`} />
              </LinearGradient>
            </Defs>
            {chart.targetY !== null ? (
              <Line
                x1={padding}
                y1={chart.targetY}
                x2={width - padding}
                y2={chart.targetY}
                stroke={colors.textMuted}
                strokeDasharray="4 4"
              />
            ) : null}
            {chart.areaPath ? <Path d={chart.areaPath} fill="url(#trendGradient)" /> : null}
            {chart.linePath ? (
              <Path d={chart.linePath} stroke={colors.accent} strokeWidth={3} fill="none" />
            ) : null}
            {chart.data.map((point, index) => (
              <Circle
                key={`trend-${index}`}
                cx={point.x}
                cy={point.y}
                r={index === chart.data.length - 1 ? 3.5 : 2.5}
                fill={colors.accent}
              />
            ))}
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
  cardTitle: {
    ...textStyles.overline,
    marginBottom: spacing.md,
    letterSpacing: 1.2,
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
  summaryActionButtonMuted: {
    backgroundColor: colors.surfaceStrong,
    borderColor: 'rgba(17,19,24,0.16)',
  },
  summaryActionText: {
    ...textStyles.caption,
    color: colors.textSecondary,
    fontWeight: '700',
  },
  summaryActionTextStrong: {
    color: colors.accentInk,
  },
  detailsPromptButton: {
    marginTop: spacing.sm,
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
    color: colors.textMuted,
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
    flexWrap: 'wrap',
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
    backgroundColor: `${colors.error}22`,
  },
  priorityBadgeMedium: {
    backgroundColor: `${colors.accent}22`,
  },
  priorityBadgeLow: {
    backgroundColor: `${colors.success}22`,
  },
  priorityText: {
    ...textStyles.caption,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  adviceTitle: {
    ...textStyles.titleMedium,
    flexShrink: 1,
  },
  adviceDetail: {
    ...textStyles.caption,
    color: colors.textSecondary,
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
