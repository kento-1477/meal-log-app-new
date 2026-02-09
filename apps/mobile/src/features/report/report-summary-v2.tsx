import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import type { AiReportPeriod, AiReportResponse, AiReportVoiceMode } from '@meal-log/shared';
import { GlassCard } from '@/components/GlassCard';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { textStyles } from '@/theme/typography';
import {
  buildReportIdentityLevel,
  buildSummaryEvidenceCards,
  getReportIdentityLabelKey,
  type SummaryEvidenceCard,
} from './report-view-model';

type SummaryStats = {
  averageCalories: number;
  loggedDays: number;
  totalDays: number;
  achievement: number;
} | null;

type ReportSummaryV2Props = {
  report: AiReportResponse;
  period: AiReportPeriod;
  voiceMode: AiReportVoiceMode;
  generatedDateLabel: string | null;
  summaryStats: SummaryStats;
  streakDays: number;
  detailsExpanded: boolean;
  onToggleDetails: () => void;
  onShare: () => void;
  t: (key: string, values?: Record<string, unknown>) => string;
};

export function SectionShellV2({
  icon,
  title,
  quickStat,
  children,
  style,
}: {
  icon: string;
  title: string;
  quickStat?: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <GlassCard style={[styles.sectionShell, style]}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionHeaderTitle}>
          <Text style={styles.sectionHeaderIcon}>{icon}</Text>
          <Text style={styles.sectionHeaderText}>{title}</Text>
        </View>
        {quickStat ? <Text style={styles.sectionQuickStat}>{quickStat}</Text> : null}
      </View>
      {children}
    </GlassCard>
  );
}

function scoreRingEmoji(score: number) {
  if (score >= 85) return '🔥';
  if (score >= 70) return '⚡️';
  if (score >= 55) return '🌤️';
  return '🌱';
}

function EvidenceCard({ item }: { item: SummaryEvidenceCard }) {
  const toneStyle =
    item.tone === 'amber'
      ? styles.evidenceAmber
      : item.tone === 'mint'
        ? styles.evidenceMint
        : styles.evidenceViolet;
  return (
    <View style={[styles.evidenceCard, toneStyle]}>
      <Text style={styles.evidenceIcon}>{item.icon}</Text>
      <View style={styles.evidenceTextWrap}>
        <Text style={styles.evidenceText}>{item.text}</Text>
        {item.emphasis ? <Text style={styles.evidenceEmphasis}>{item.emphasis}</Text> : null}
      </View>
    </View>
  );
}

function ScoreHero({ score, t }: { score: number; t: (key: string, values?: Record<string, unknown>) => string }) {
  const size = 172;
  const strokeWidth = 14;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(Math.max(score / 100, 0), 1);
  const dashOffset = circumference * (1 - progress);
  return (
    <View style={styles.scoreHero}>
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id="smartScoreGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#F5B225" />
            <Stop offset="100%" stopColor="#FF7B7B" />
          </LinearGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke="rgba(30,34,46,0.12)" strokeWidth={strokeWidth} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="url(#smartScoreGradient)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashOffset}
          fill="none"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.scoreCenter}>
        <Text style={styles.scoreValue}>{Math.round(score)}</Text>
        <Text style={styles.scoreLabel}>
          {t('report.scoreLabel')} {scoreRingEmoji(score)}
        </Text>
      </View>
    </View>
  );
}

function KpiTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'strong' | 'neutral';
}) {
  return (
    <View style={[styles.kpiTile, tone === 'strong' && styles.kpiTileStrong]}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={styles.kpiValue}>{value}</Text>
    </View>
  );
}

export function ReportSummaryV2({
  report,
  period,
  voiceMode,
  generatedDateLabel,
  summaryStats,
  streakDays,
  detailsExpanded,
  onToggleDetails,
  onShare,
  t,
}: ReportSummaryV2Props) {
  const identityLevel = useMemo(
    () => buildReportIdentityLevel(Math.round(report.summary.score), streakDays),
    [report.summary.score, streakDays],
  );
  const evidenceCards = useMemo(() => buildSummaryEvidenceCards(report), [report]);
  const periodLabel = t(`report.period.${period}`);
  return (
    <GlassCard style={styles.summaryCard} contentStyle={styles.summaryCardContent}>
      <View style={styles.identityStrip}>
        <View style={styles.badgeRow}>
          <View style={styles.identityBadge}>
            <Text style={styles.identityBadgeText}>{t(getReportIdentityLabelKey(identityLevel))}</Text>
          </View>
          <View style={styles.modeBadge}>
            <Text style={styles.modeBadgeText}>{t(`report.preference.voiceMode.${voiceMode}`)}</Text>
          </View>
          <View style={styles.periodBadge}>
            <Text style={styles.periodBadgeText}>{periodLabel}</Text>
          </View>
        </View>
        {generatedDateLabel ? (
          <Text style={styles.generatedDate}>
            {t('report.summary.generatedDate')}: {generatedDateLabel}
          </Text>
        ) : null}
      </View>

      <View style={styles.heroRow}>
        <ScoreHero score={report.summary.score} t={t} />
        <View style={styles.kpiGrid}>
          <KpiTile label={`🎯 ${t('report.stat.achievement')}`} value={summaryStats ? `${summaryStats.achievement}%` : '--'} tone="strong" />
          <KpiTile
            label={`🔥 ${t('report.stat.averageCalories')}`}
            value={summaryStats ? `${summaryStats.averageCalories} kcal` : '--'}
            tone="neutral"
          />
          <KpiTile
            label={`🗓️ ${t('report.stat.loggedDays')}`}
            value={summaryStats ? `${summaryStats.loggedDays}/${summaryStats.totalDays}` : '--'}
            tone="neutral"
          />
          <KpiTile label={`🔥 ${t('report.streakLabel')}`} value={`${streakDays}`} tone="neutral" />
        </View>
      </View>

      <View style={styles.missionBlock}>
        <Text style={styles.missionLabel}>{t('report.summaryV2.topMission')}</Text>
        <Text style={styles.missionText}>{report.summary.headline}</Text>
      </View>

      <View style={styles.evidenceList}>
        {evidenceCards.map((item) => (
          <EvidenceCard key={item.id} item={item} />
        ))}
      </View>

      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.actionButton, styles.actionPrimary]}
          onPress={onToggleDetails}
          accessibilityRole="button"
          accessibilityLabel={detailsExpanded ? t('report.hideDetails') : t('report.cta.viewDetailsPrimary')}
        >
          <Text style={styles.actionPrimaryText}>
            {detailsExpanded ? t('report.hideDetails') : t('report.cta.viewDetailsPrimary')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={onShare} accessibilityRole="button">
          <Text style={styles.actionSecondaryText}>{t('report.shareButton')}</Text>
        </TouchableOpacity>
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  summaryCard: {
    marginTop: spacing.sm,
  },
  summaryCardContent: {
    gap: spacing.md,
  },
  identityStrip: {
    gap: spacing.xs,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  identityBadge: {
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    backgroundColor: colors.smartProPrimary,
    minHeight: 30,
    justifyContent: 'center',
  },
  identityBadgeText: {
    ...textStyles.caption,
    color: colors.smartProPrimaryText,
    fontWeight: '800',
  },
  modeBadge: {
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    backgroundColor: '#EAF2FF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(20,26,38,0.16)',
    minHeight: 30,
    justifyContent: 'center',
  },
  modeBadgeText: {
    ...textStyles.caption,
    color: '#293244',
    fontWeight: '700',
  },
  periodBadge: {
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    backgroundColor: '#F6ECD6',
    minHeight: 30,
    justifyContent: 'center',
  },
  periodBadgeText: {
    ...textStyles.caption,
    color: '#5A4424',
    fontWeight: '700',
  },
  generatedDate: {
    ...textStyles.caption,
    color: colors.textMuted,
    fontWeight: '600',
  },
  heroRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  scoreHero: {
    width: 172,
    height: 172,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreValue: {
    ...textStyles.heading,
    fontSize: 54,
    lineHeight: 58,
    color: colors.smartProInk,
    fontWeight: '800',
  },
  scoreLabel: {
    ...textStyles.caption,
    color: colors.smartProMuted,
    fontWeight: '700',
  },
  kpiGrid: {
    flex: 1,
    minWidth: 180,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  kpiTile: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    minHeight: 74,
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  kpiTileStrong: {
    backgroundColor: '#FAF1DC',
    borderColor: 'rgba(150,104,30,0.26)',
  },
  kpiLabel: {
    ...textStyles.caption,
    color: colors.textSecondary,
    fontWeight: '700',
  },
  kpiValue: {
    ...textStyles.titleMedium,
    color: '#10151F',
    fontWeight: '800',
  },
  missionBlock: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(20,26,38,0.16)',
    backgroundColor: '#F2F5FB',
    padding: spacing.md,
    gap: spacing.xs,
  },
  missionLabel: {
    ...textStyles.caption,
    color: '#596173',
    fontWeight: '700',
  },
  missionText: {
    ...textStyles.titleMedium,
    color: colors.smartProInk,
    fontSize: 20,
    lineHeight: 30,
    fontWeight: '800',
  },
  evidenceList: {
    gap: spacing.sm,
  },
  evidenceCard: {
    borderRadius: 14,
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(20,26,38,0.1)',
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  evidenceAmber: {
    backgroundColor: '#F8F0DA',
  },
  evidenceMint: {
    backgroundColor: '#E6F5F2',
  },
  evidenceViolet: {
    backgroundColor: '#ECE8F8',
  },
  evidenceIcon: {
    fontSize: 18,
    lineHeight: 24,
  },
  evidenceTextWrap: {
    flex: 1,
    gap: 2,
  },
  evidenceText: {
    ...textStyles.body,
    color: colors.smartProInk,
    fontWeight: '700',
    lineHeight: 28,
  },
  evidenceEmphasis: {
    ...textStyles.caption,
    color: '#2A3346',
    fontWeight: '800',
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionButton: {
    flex: 1,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  actionPrimary: {
    backgroundColor: colors.smartProPrimary,
    borderColor: colors.smartProPrimary,
  },
  actionPrimaryText: {
    ...textStyles.caption,
    color: colors.smartProPrimaryText,
    fontWeight: '800',
  },
  actionSecondaryText: {
    ...textStyles.caption,
    color: '#1F2738',
    fontWeight: '800',
  },
  sectionShell: {
    marginTop: spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  sectionHeaderTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flex: 1,
  },
  sectionHeaderIcon: {
    fontSize: 16,
  },
  sectionHeaderText: {
    ...textStyles.titleMedium,
    color: '#121823',
    fontWeight: '800',
  },
  sectionQuickStat: {
    ...textStyles.caption,
    color: '#47506A',
    fontWeight: '700',
  },
});
