import React, { useEffect, useMemo, useRef } from 'react';
import { LinearGradient as ExpoLinearGradient } from 'expo-linear-gradient';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
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
import { resolveReportWeatherTheme, type ReportWeatherTheme } from './score-weather-theme';

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

function EvidenceCard({ item }: { item: SummaryEvidenceCard }) {
  const toneStyle =
    item.tone === 'amber' ? styles.evidenceAmber : item.tone === 'mint' ? styles.evidenceMint : styles.evidenceViolet;
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

function WeatherStateBadge({
  theme,
  label,
  backgroundColor,
  textColor,
}: {
  theme: ReportWeatherTheme;
  label: string;
  backgroundColor: string;
  textColor: string;
}) {
  const motion = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    motion.stopAnimation();
    motion.setValue(0);
    if (theme !== 'partlySunny') {
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(motion, {
          toValue: 1,
          duration: 1400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(motion, {
          toValue: 0,
          duration: 1400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [motion, theme]);

  const glowOpacity = motion.interpolate({
    inputRange: [0, 1],
    outputRange: [0.2, 0.65],
  });
  const glowTranslate = motion.interpolate({
    inputRange: [0, 1],
    outputRange: [-18, 18],
  });

  return (
    <View style={[styles.weatherBadge, { backgroundColor }]}>
      {theme === 'partlySunny' ? (
        <View pointerEvents="none" style={styles.weatherBadgeGlowWrap}>
          <Animated.View
            style={[
              styles.weatherBadgeGlow,
              {
                opacity: glowOpacity,
                transform: [{ translateX: glowTranslate }],
              },
            ]}
          />
        </View>
      ) : null}
      <Text style={[styles.weatherBadgeText, { color: textColor }]}>{label}</Text>
    </View>
  );
}

function ScoreHero({
  score,
  ringStart,
  ringEnd,
  ringTrack,
  compact,
  t,
}: {
  score: number;
  ringStart: string;
  ringEnd: string;
  ringTrack: string;
  compact: boolean;
  t: (key: string, values?: Record<string, unknown>) => string;
}) {
  const size = compact ? 172 : 194;
  const strokeWidth = compact ? 14 : 16;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(Math.max(score / 100, 0), 1);
  const dashOffset = circumference * (1 - progress);

  return (
    <View style={[styles.scoreHero, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        <Defs>
          <SvgLinearGradient id="weatherScoreGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor={ringStart} />
            <Stop offset="100%" stopColor={ringEnd} />
          </SvgLinearGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={ringTrack} strokeWidth={strokeWidth} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="url(#weatherScoreGradient)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashOffset}
          fill="none"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.scoreCenter}>
        <Text style={[styles.scoreValue, compact && styles.scoreValueCompact]}>{Math.round(score)}</Text>
        <Text style={styles.scoreLabel}>{t('report.scoreLabel')}</Text>
      </View>
    </View>
  );
}

function KpiMini({
  label,
  value,
  backgroundColor,
}: {
  label: string;
  value: string;
  backgroundColor: string;
}) {
  return (
    <View style={[styles.kpiMini, { backgroundColor }]}>
      <Text style={styles.kpiMiniLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={styles.kpiMiniValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
        {value}
      </Text>
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
  const { width } = useWindowDimensions();
  const compact = width < 390;
  const identityLevel = useMemo(
    () => buildReportIdentityLevel(Math.round(report.summary.score), streakDays),
    [report.summary.score, streakDays],
  );
  const evidenceCards = useMemo(() => buildSummaryEvidenceCards(report), [report]);
  const periodLabel = t(`report.period.${period}`);
  const weatherTheme = useMemo(() => resolveReportWeatherTheme(report.summary.score), [report.summary.score]);

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

      <ExpoLinearGradient colors={[weatherTheme.heroStart, weatherTheme.heroEnd]} style={styles.decisionHero}>
        <View style={styles.decisionHeaderRow}>
          <WeatherStateBadge
            theme={weatherTheme.theme}
            label={t(weatherTheme.labelKey)}
            backgroundColor={weatherTheme.badgeBg}
            textColor={weatherTheme.badgeText}
          />
          <Text style={styles.decisionLabel}>{t('report.summaryV2.decisionLabel')}</Text>
        </View>

        <View style={styles.decisionBodyRow}>
          <ScoreHero
            score={report.summary.score}
            ringStart={weatherTheme.ringStart}
            ringEnd={weatherTheme.ringEnd}
            ringTrack={weatherTheme.ringTrack}
            compact={compact}
            t={t}
          />
          <View style={styles.decisionCopyWrap}>
            <Text style={[styles.decisionStateText, compact && styles.decisionStateTextCompact]} numberOfLines={2}>
              {t(weatherTheme.decisionStateKey)}
            </Text>
            <Text style={styles.decisionAchievementLabel}>🎯 {t('report.stat.achievement')}</Text>
            <Text style={[styles.decisionAchievementValue, compact && styles.decisionAchievementValueCompact]}>
              {summaryStats ? `${summaryStats.achievement}%` : '--'}
            </Text>
          </View>
        </View>
      </ExpoLinearGradient>

      <View style={[styles.missionBlock, { backgroundColor: weatherTheme.missionBg, borderColor: weatherTheme.missionBorder }]}>
        <Text style={styles.missionLabel}>{t('report.summaryV2.topMission')}</Text>
        <Text style={[styles.missionText, compact && styles.missionTextCompact]} numberOfLines={3}>
          {report.summary.headline}
        </Text>
      </View>

      <View style={styles.kpiRow}>
        <KpiMini
          label={`🔥 ${t('report.stat.averageCalories')}`}
          value={summaryStats ? `${summaryStats.averageCalories} kcal` : '--'}
          backgroundColor={weatherTheme.kpiBg}
        />
        <KpiMini
          label={`🗓️ ${t('report.stat.loggedDays')}`}
          value={summaryStats ? `${summaryStats.loggedDays}/${summaryStats.totalDays}` : '--'}
          backgroundColor={weatherTheme.kpiBg}
        />
        <KpiMini label={`🔥 ${t('report.streakLabel')}`} value={`${streakDays}`} backgroundColor={weatherTheme.kpiBg} />
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
  decisionHero: {
    borderRadius: 24,
    padding: spacing.md,
    gap: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(20,26,38,0.08)',
  },
  decisionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  weatherBadge: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    minHeight: 30,
    justifyContent: 'center',
  },
  weatherBadgeGlowWrap: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    justifyContent: 'center',
  },
  weatherBadgeGlow: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,236,175,0.95)',
    marginLeft: -12,
  },
  weatherBadgeText: {
    ...textStyles.caption,
    fontWeight: '800',
  },
  decisionLabel: {
    ...textStyles.caption,
    color: '#3D4A60',
    fontWeight: '700',
  },
  decisionBodyRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    alignItems: 'center',
  },
  scoreHero: {
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
    fontSize: 74,
    lineHeight: 76,
    color: '#101520',
    fontWeight: '800',
  },
  scoreValueCompact: {
    fontSize: 62,
    lineHeight: 66,
  },
  scoreLabel: {
    ...textStyles.caption,
    color: '#47516A',
    fontWeight: '700',
  },
  decisionCopyWrap: {
    flex: 1,
    minWidth: 180,
    gap: spacing.xs,
  },
  decisionStateText: {
    ...textStyles.titleMedium,
    color: '#162032',
    fontWeight: '800',
    fontSize: 28,
    lineHeight: 36,
  },
  decisionStateTextCompact: {
    fontSize: 23,
    lineHeight: 30,
  },
  decisionAchievementLabel: {
    ...textStyles.caption,
    color: '#4E5B72',
    fontWeight: '700',
    marginTop: spacing.xs,
  },
  decisionAchievementValue: {
    ...textStyles.heading,
    color: '#111827',
    fontSize: 54,
    lineHeight: 58,
    fontWeight: '800',
  },
  decisionAchievementValueCompact: {
    fontSize: 46,
    lineHeight: 50,
  },
  missionBlock: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
  },
  missionLabel: {
    ...textStyles.caption,
    color: '#596173',
    fontWeight: '700',
  },
  missionText: {
    ...textStyles.heading,
    color: colors.smartProInk,
    fontSize: 34,
    lineHeight: 44,
    fontWeight: '800',
  },
  missionTextCompact: {
    fontSize: 28,
    lineHeight: 36,
  },
  kpiRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  kpiMini: {
    flex: 1,
    minWidth: 148,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(20,26,38,0.08)',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    gap: spacing.xs,
    minHeight: 68,
  },
  kpiMiniLabel: {
    ...textStyles.caption,
    color: '#566176',
    fontWeight: '700',
  },
  kpiMiniValue: {
    ...textStyles.titleMedium,
    color: '#101723',
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
