import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DateTime } from 'luxon';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { AiReportAdvice, AiReportPeriod, AiReportResponse, DashboardPeriod } from '@meal-log/shared';
import Svg, { Circle, Defs, G, LinearGradient, Line, Path, Stop } from 'react-native-svg';
import { arc, area, curveMonotoneX, line } from 'd3-shape';
import { AuroraBackground } from '@/components/AuroraBackground';
import { GlassCard } from '@/components/GlassCard';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useDashboardSummary, type ChartPoint, type MealPeriodBreakdown, type MacroStat } from '@/features/dashboard/useDashboardSummary';
import { createAiReport, getDashboardSummary, type ApiError } from '@/services/api';
import { useTranslation } from '@/i18n';
import { useSessionStore } from '@/store/session';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { textStyles } from '@/theme/typography';

type ReportCache = Record<string, AiReportResponse>;

const DEFAULT_CACHE: ReportCache = {};

type ReportRange = { from: string; to: string };

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

function toISODateSafe(value: DateTime) {
  return value.toISODate() ?? value.toFormat('yyyy-MM-dd');
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

function highlightTint(index: number) {
  return HIGHLIGHT_TONES[index % HIGHLIGHT_TONES.length];
}

export default function ReportScreen() {
  const { t, locale } = useTranslation();
  const setUsage = useSessionStore((state) => state.setUsage);
  const today = useMemo(() => DateTime.now().startOf('day'), []);
  const initialDate = useMemo(() => toISODateSafe(today), [today]);
  const initialMonth = useMemo(() => toISODateSafe(today.startOf('month')), [today]);
  const [period, setPeriod] = useState<AiReportPeriod>('daily');
  const [isGenerating, setIsGenerating] = useState(false);
  const [reports, setReports] = useState<ReportCache>(DEFAULT_CACHE);
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
    const monthStart = calendarViewDate.startOf('month');
    return {
      from: toISODateSafe(monthStart),
      to: toISODateSafe(monthStart.endOf('month')),
    };
  }, [calendarViewDate, period]);
  const calendarSummary = useQuery({
    queryKey: ['reportCalendar', period, calendarViewMonth, locale],
    queryFn: () => getDashboardSummary('custom', calendarRange ?? undefined),
    enabled: period !== 'monthly' && Boolean(calendarRange),
    staleTime: 1000 * 60 * 2,
  });
  const recordedDayList = useMemo(() => {
    if (!calendarSummary.data) {
      return [];
    }
    return calendarSummary.data.calories.daily.filter((entry) => entry.total > 0).map((entry) => entry.date);
  }, [calendarSummary.data]);
  const recordedDays = useMemo(() => new Set(recordedDayList), [recordedDayList]);
  const hasRecordedDays = recordedDayList.length > 0;

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
    if (!hasRecordedDays) {
      setWeeklySelected(null);
      return;
    }
    if (!weeklySelected || !recordedDays.has(weeklySelected)) {
      setWeeklySelected(recordedDayList[recordedDayList.length - 1]);
    }
  }, [calendarSummary.data, hasRecordedDays, period, recordedDayList, recordedDays, weeklySelected]);

  const selectedRange = useMemo(() => {
    if (period === 'daily') {
      if (!dailySelected) return null;
      return { from: dailySelected, to: dailySelected };
    }
    if (period === 'weekly') {
      if (!weeklySelected) return null;
      const anchor = DateTime.fromISO(weeklySelected).setLocale(locale);
      const start = anchor.startOf('week');
      const end = start.plus({ days: 6 });
      return { from: toISODateSafe(start), to: toISODateSafe(end) };
    }
    const monthStart = DateTime.fromObject({ year: monthlyYear, month: monthlyMonth, day: 1 });
    return { from: toISODateSafe(monthStart), to: toISODateSafe(monthStart.endOf('month')) };
  }, [dailySelected, locale, monthlyMonth, monthlyYear, period, weeklySelected]);
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
  const rangeLabel = useMemo(() => {
    if (report) {
      return formatReportRange(report, locale);
    }
    if (selectedRange) {
      return formatSelectedRange(selectedRange, locale);
    }
    return t('report.rangePlaceholder');
  }, [locale, report, selectedRange, t]);
  const canGenerate = Boolean(selectedRange);
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

  const mutation = useMutation({
    mutationFn: (payload: { period: AiReportPeriod; range: { from: string; to: string } }) =>
      createAiReport(payload.period, payload.range),
    onSuccess: (response, payload) => {
      const cacheKey = buildReportKey(payload.period, payload.range);
      setReports((prev) => ({ ...prev, [cacheKey]: response.report }));
      if (response.usage) {
        setUsage(response.usage);
      }
    },
    onError: (error) => {
      const apiError = error as ApiError;
      const message = apiError?.message ?? t('report.errorFallback');
      Alert.alert(t('report.errorTitle'), message);
    },
    onSettled: () => {
      setIsGenerating(false);
    },
  });

  const handleGenerate = () => {
    if (mutation.isLoading || isGenerating) {
      return;
    }
    if (!selectedRange) {
      Alert.alert(t('report.errorTitle'), t('report.rangeMissing'));
      return;
    }
    setIsGenerating(true);
    mutation.mutate({ period, range: selectedRange });
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
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Text style={styles.title}>{t('report.header')}</Text>
            <Text style={styles.subtitle}>{t('report.subtitle')}</Text>
          </View>

          <View style={styles.segmentGroup} accessibilityRole="tablist">
            {periodOptions.map((option) => {
              const active = option.key === period;
              const disabled = mutation.isLoading || isGenerating;
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
            <Text style={styles.cardTitle}>📅 {t('report.section.rangeSelect')}</Text>
            {period === 'daily' ? (
              <>
                <Text style={styles.calendarHint}>{t('report.calendar.hint.daily')}</Text>
                {calendarSummary.isLoading ? (
                  <ActivityIndicator color={colors.accent} />
                ) : (
                  <>
                    <ReportCalendar
                      locale={locale}
                      month={DateTime.fromISO(dailyViewMonth)}
                      mode="daily"
                      recordedDates={recordedDays}
                      selectedDate={dailySelected}
                      selectedWeekAnchor={null}
                      onSelectDate={handleDailySelect}
                      onSelectWeek={handleWeeklySelect}
                      onPrevMonth={() => handleDailyMonthShift(-1)}
                      onNextMonth={() => handleDailyMonthShift(1)}
                    />
                    {!hasRecordedDays ? (
                      <Text style={styles.calendarEmpty}>{t('report.calendar.empty')}</Text>
                    ) : null}
                  </>
                )}
              </>
            ) : period === 'weekly' ? (
              <>
                <Text style={styles.calendarHint}>{t('report.calendar.hint.weekly')}</Text>
                {calendarSummary.isLoading ? (
                  <ActivityIndicator color={colors.accent} />
                ) : (
                  <>
                    <ReportCalendar
                      locale={locale}
                      month={DateTime.fromISO(weeklyViewMonth)}
                      mode="weekly"
                      recordedDates={recordedDays}
                      selectedDate={null}
                      selectedWeekAnchor={weeklySelected}
                      onSelectDate={handleWeeklySelect}
                      onSelectWeek={handleWeeklySelect}
                      onPrevMonth={() => handleWeeklyMonthShift(-1)}
                      onNextMonth={() => handleWeeklyMonthShift(1)}
                    />
                    {!hasRecordedDays ? (
                      <Text style={styles.calendarEmpty}>{t('report.calendar.empty')}</Text>
                    ) : null}
                  </>
                )}
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
              </>
            )}
          </GlassCard>

          <PrimaryButton
            label={
              mutation.isLoading || isGenerating
                ? t('report.generatingShort')
                : report
                  ? t('report.generateAgain')
                  : t('report.generate')
            }
            onPress={handleGenerate}
            loading={mutation.isLoading || isGenerating}
            disabled={!canGenerate}
          />
          {mutation.isLoading || isGenerating ? (
            <View style={styles.loadingInline}>
              <ActivityIndicator color={colors.textMuted} />
              <Text style={styles.loadingInlineText}>{t('report.generating')}</Text>
            </View>
          ) : (
            <Text style={styles.tokenNote}>{t('report.tokenNote')}</Text>
          )}

          {!report ? (
            <GlassCard style={styles.card}>
              <Text style={styles.emptyTitle}>{t('report.emptyTitle')}</Text>
              <Text style={styles.emptyBody}>{t('report.emptyBody')}</Text>
            </GlassCard>
          ) : (
            <>
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
                      <Text style={styles.heroStatValue}>
                        {summaryStats ? `${summaryStats.averageCalories} kcal` : '--'}
                      </Text>
                    </View>
                    <View style={styles.heroStat}>
                      <Text style={styles.heroStatLabel}>🗓️ {t('report.stat.loggedDays')}</Text>
                      <Text style={styles.heroStatValue}>
                        {summaryStats ? `${summaryStats.loggedDays} / ${summaryStats.totalDays}` : '--'}
                      </Text>
                    </View>
                    <View style={styles.heroStat}>
                      <Text style={styles.heroStatLabel}>🎯 {t('report.stat.achievement')}</Text>
                      <Text style={styles.heroStatValue}>
                        {summaryStats ? `${summaryStats.achievement}%` : '--'}
                      </Text>
                    </View>
                  </View>
                </View>
                <Text style={styles.summaryHeadline}>{report.summary.headline}</Text>
                <View style={styles.highlightRow}>
                  {report.summary.highlights.map((highlight, index) => (
                    <View
                      key={`${highlight}-${index}`}
                      style={[
                        styles.highlightChip,
                        { backgroundColor: `${highlightTint(index)}33` },
                      ]}
                    >
                      <Text style={styles.highlightText}>{highlight}</Text>
                    </View>
                  ))}
                </View>
              </GlassCard>

              <GlassCard style={styles.card}>
                <Text style={styles.cardTitle}>📈 {t('report.section.trend')}</Text>
                {dashboardSummary.isLoading && !dashboard ? (
                  <ActivityIndicator color={colors.accent} />
                ) : dashboard?.calories.points.length ? (
                  <TrendLineChart points={dashboard.calories.points} target={dashboard.calories.targetLine} />
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

        </ScrollView>
      </SafeAreaView>
    </AuroraBackground>
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
          const weekHasData = week.some((day) => recordedDates.has(toISODateSafe(day)));
          const isSelectedWeek =
            selectedWeekStart != null ? week.some((day) => day.hasSame(selectedWeekStart, 'week')) : false;
          return (
            <View
              key={`week-${rowIndex}`}
              style={[
                styles.calendarRow,
                mode === 'weekly' && isSelectedWeek && styles.calendarRowSelected,
                mode === 'weekly' && !weekHasData && styles.calendarRowDisabled,
              ]}
            >
              {week.map((day) => {
                const isoDate = toISODateSafe(day);
                const isOutside = !day.hasSame(month, 'month');
                const isRecorded = recordedDates.has(isoDate);
                const isSelected = mode === 'daily' && selectedDate === isoDate;
                const isInSelectedWeek = mode === 'weekly' && isSelectedWeek;
                const isDisabled = isOutside || (mode === 'daily' ? !isRecorded : !weekHasData);
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
        const label = locale.startsWith('ja') ? dt.toFormat('LL月') : dt.toFormat('MMM');
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

function TrendLineChart({ points, target }: { points: ChartPoint[]; target: number }) {
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
  return Array.from({ length: 7 }, (_, index) => start.plus({ days: index }).toFormat('ccc'));
}

function formatCalendarMonth(month: DateTime, locale: string) {
  return month.setLocale(locale).toFormat(locale.startsWith('ja') ? 'yyyy年LL月' : 'LLLL yyyy');
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
  trendNote: {
    ...textStyles.caption,
    color: colors.textMuted,
    marginTop: spacing.sm,
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
});
