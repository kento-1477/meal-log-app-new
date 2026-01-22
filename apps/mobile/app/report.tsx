import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DateTime } from 'luxon';
import { useMutation } from '@tanstack/react-query';
import type { AiReportAdvice, AiReportPeriod, AiReportResponse } from '@meal-log/shared';
import { AuroraBackground } from '@/components/AuroraBackground';
import { GlassCard } from '@/components/GlassCard';
import { PrimaryButton } from '@/components/PrimaryButton';
import { createAiReport, type ApiError } from '@/services/api';
import { useTranslation } from '@/i18n';
import { useSessionStore } from '@/store/session';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { textStyles } from '@/theme/typography';

type ReportCache = Record<AiReportPeriod, AiReportResponse | null>;

const DEFAULT_CACHE: ReportCache = {
  daily: null,
  weekly: null,
  monthly: null,
};

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

export default function ReportScreen() {
  const { t, locale } = useTranslation();
  const setUsage = useSessionStore((state) => state.setUsage);
  const [period, setPeriod] = useState<AiReportPeriod>('daily');
  const [isGenerating, setIsGenerating] = useState(false);
  const [reports, setReports] = useState<ReportCache>(DEFAULT_CACHE);
  const report = reports[period];

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

  const mutation = useMutation({
    mutationFn: (targetPeriod: AiReportPeriod) => createAiReport(targetPeriod),
    onSuccess: (response, targetPeriod) => {
      setReports((prev) => ({ ...prev, [targetPeriod]: response.report }));
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
    setIsGenerating(true);
    mutation.mutate(period);
  };

  const formatPriority = (value: AiReportAdvice['priority']) => {
    if (value === 'high') return t('report.priority.high');
    if (value === 'medium') return t('report.priority.medium');
    return t('report.priority.low');
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
            <Text style={styles.rangeValue}>
              {report ? formatReportRange(report, locale) : t('report.rangePlaceholder')}
            </Text>
          </View>

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
                <Text style={styles.cardTitle}>{t('report.section.summary')}</Text>
                <View style={styles.summaryRow}>
                  <View style={styles.summaryText}>
                    <Text style={styles.summaryHeadline}>{report.summary.headline}</Text>
                    <View style={styles.highlightRow}>
                      {report.summary.highlights.map((highlight, index) => (
                        <View key={`${highlight}-${index}`} style={styles.highlightChip}>
                          <Text style={styles.highlightText}>{highlight}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                  <View style={styles.scoreBadge}>
                    <Text style={styles.scoreValue}>{Math.round(report.summary.score)}</Text>
                    <Text style={styles.scoreLabel}>{t('report.scoreLabel')}</Text>
                  </View>
                </View>
              </GlassCard>

              <GlassCard style={styles.card}>
                <Text style={styles.cardTitle}>{t('report.section.metrics')}</Text>
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
                <Text style={styles.cardTitle}>{t('report.section.ingredients')}</Text>
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
                <Text style={styles.cardTitle}>{t('report.section.advice')}</Text>
                <View style={styles.adviceList}>
                  {report.advice.map((advice, index) => (
                    <View key={`${advice.title}-${index}`} style={styles.adviceItem}>
                      <View style={styles.adviceHeader}>
                        <View style={styles.priorityBadge}>
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
  },
  emptyTitle: {
    ...textStyles.titleMedium,
    marginBottom: spacing.sm,
  },
  emptyBody: {
    ...textStyles.caption,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  summaryText: {
    flex: 1,
    gap: spacing.sm,
  },
  summaryHeadline: {
    ...textStyles.titleMedium,
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
    backgroundColor: `${colors.accent}22`,
  },
  highlightText: {
    ...textStyles.caption,
    color: colors.accentInk,
    fontWeight: '600',
  },
  scoreBadge: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceStrong,
    borderRadius: 16,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  scoreValue: {
    ...textStyles.titleLarge,
    fontSize: 28,
  },
  scoreLabel: {
    ...textStyles.caption,
    color: colors.textMuted,
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
    backgroundColor: `${colors.accentSage}22`,
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
