import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { MealLogSummary, MealLogRange } from '@meal-log/shared';
import { useRouter } from 'expo-router';
import { cacheDirectory, deleteAsync, EncodingType, writeAsStringAsync } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { textStyles } from '@/theme/typography';
import { useTranslation } from '@/i18n';
import {
  getLogsExport,
  getMealLogShare,
  deleteMealLogEntry,
  restoreMealLogEntry,
  type ExportRange,
} from '@/services/api';
import { buildCsv, buildPdfHtml, type ExportItem } from '@/utils/logExport';
import { describeLocale } from '@/utils/locale';
import { useSessionStore } from '@/store/session';
import { usePremiumStore } from '@/store/premium';

const BASE_RANGE_OPTIONS: Array<{ value: MealLogRange; labelKey: string }> = [
  { value: 'today', labelKey: 'history.range.today' },
  { value: 'week', labelKey: 'history.range.week' },
  { value: 'twoWeeks', labelKey: 'history.range.twoWeeks' },
  { value: 'threeWeeks', labelKey: 'history.range.threeWeeks' },
  { value: 'month', labelKey: 'history.range.month' },
];

const PREMIUM_EXTRA_RANGE: { value: MealLogRange; labelKey: string } = {
  value: 'threeMonths',
  labelKey: 'history.range.threeMonths',
};

interface Props {
  logs: MealLogSummary[];
  range?: MealLogRange;
  onRangeChange?: (range: MealLogRange) => void;
  onToggleFavorite?: (log: MealLogSummary, targetState: boolean) => void;
  togglingId?: string | null;
}

export function RecentLogsList({ logs, range = 'today', onRangeChange, onToggleFavorite, togglingId }: Props) {
  const router = useRouter();
  const { t, locale } = useTranslation();
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [exportVisible, setExportVisible] = useState(false);
  const [exportRange, setExportRange] = useState<ExportRange>('day');
  const [exportFormat, setExportFormat] = useState<'csv' | 'pdf'>('csv');
  const [isExporting, setIsExporting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const sessionPlan = useSessionStore((state) => state.user?.plan ?? 'FREE');
  const premiumState = usePremiumStore((state) => state.status);
  const isPremium = premiumState?.isPremium ?? sessionPlan === 'PREMIUM';
  const rangeOptions = isPremium ? [...BASE_RANGE_OPTIONS, PREMIUM_EXTRA_RANGE] : BASE_RANGE_OPTIONS;
  const showPremiumUpsell = !isPremium;

  if (!logs.length) {
    return (
      <View style={styles.container}>
        <Text style={styles.heading}>{t('recentLogs.heading')}</Text>
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>{t('recentLogs.empty')}</Text>
          {showPremiumUpsell ? <Text style={styles.resetNotice}>{t('recentLogs.resetNotice')}</Text> : null}
          <TouchableOpacity style={styles.cta} onPress={() => router.push('/(tabs)/chat')}>
            <Text style={styles.ctaLabel}>{t('button.record')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.heading}>{t('recentLogs.heading')}</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => setExportVisible(true)}>
            <Text style={styles.secondaryCta}>CSV / PDF</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/(tabs)/chat')}>
            <Text style={styles.secondaryCta}>{t('recentLogs.addMore')}</Text>
          </TouchableOpacity>
        </View>
      </View>
      {onRangeChange && (
        <View style={styles.rangeRow}>
          {rangeOptions.map((option) => {
            const isActive = option.value === range;
            return (
              <TouchableOpacity
                key={option.value}
                style={[styles.rangeChip, isActive && styles.rangeChipActive]}
                onPress={() => onRangeChange(option.value)}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
              >
                <Text style={[styles.rangeLabel, isActive && styles.rangeLabelActive]}>{t(option.labelKey)}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
      {showPremiumUpsell && (
        <View style={styles.premiumCard}>
          <Text style={styles.premiumTitle}>{t('recentLogs.premiumUpsell.title')}</Text>
          <Text style={styles.premiumSubtitle}>{t('recentLogs.premiumUpsell.description')}</Text>
          <TouchableOpacity style={styles.premiumButton} onPress={() => router.push('/referral-status')}>
            <Text style={styles.premiumButtonLabel}>{t('recentLogs.premiumUpsell.cta')}</Text>
          </TouchableOpacity>
        </View>
      )}
      <View style={styles.list}>
        {logs.map((log) => (
          <TouchableOpacity key={log.id} style={styles.item} onPress={() => router.push(`/log/${log.id}`)}>
            <View style={styles.itemHeader}>
              <Text style={styles.itemTitle}>{log.dish}</Text>
              <Text style={styles.itemCalories}>{Math.round(log.calories)} kcal</Text>
            </View>
            <View style={styles.macrosRow}>
              <Text style={styles.macroLabel}>{t('macro.protein')}: {log.protein_g} g</Text>
              <Text style={styles.macroLabel}>{t('macro.fat')}: {log.fat_g} g</Text>
              <Text style={styles.macroLabel}>{t('macro.carbs')}: {log.carbs_g} g</Text>
            </View>
            {log.fallback_applied && log.requested_locale && log.locale && log.requested_locale !== log.locale ? (
              <Text style={styles.fallbackNote}>
                ※ {describeLocale(log.requested_locale)} の翻訳が未対応のため {describeLocale(log.locale)} で表示しています
              </Text>
            ) : null}
            <View style={styles.itemFooter}>
              {onToggleFavorite ? (
                <TouchableOpacity
                  style={[styles.favoriteToggle, (log.favorite_meal_id ?? null) !== null && styles.favoriteToggleActive]}
                  onPress={(event) => {
                    event.stopPropagation();
                    onToggleFavorite(log, (log.favorite_meal_id ?? null) === null);
                  }}
                  disabled={togglingId === log.id}
                >
                  {togglingId === log.id ? (
                    <ActivityIndicator size="small" color={colors.accent} />
                  ) : (
                    <Text style={styles.favoriteToggleLabel}>
                      {(log.favorite_meal_id ?? null) !== null ? '★' : '☆'}
                    </Text>
                  )}
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={styles.shareLink}
                onPress={(event) => {
                  event.stopPropagation();
                  handleShare(log.id);
                }}
                disabled={sharingId === log.id}
              >
                {sharingId === log.id ? (
                  <ActivityIndicator size="small" color={colors.accent} />
                ) : (
                  <Text style={styles.shareLabel}>共有</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.deleteLink}
                onPress={(event) => {
                  event.stopPropagation();
                  confirmDelete(log.id);
                }}
                disabled={deletingId === log.id}
              >
                {deletingId === log.id ? (
                  <ActivityIndicator size="small" color={colors.error} />
                ) : (
                  <Text style={styles.deleteLabel}>{t('common.delete')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        ))}
      </View>
      <ExportModal
        visible={exportVisible}
        onClose={() => setExportVisible(false)}
        range={exportRange}
        format={exportFormat}
        setRange={setExportRange}
        setFormat={setExportFormat}
        onExport={handleExport}
        exporting={isExporting}
      />
    </View>
  );

  async function handleShare(logId: string) {
    try {
      setSharingId(logId);
      const response = await getMealLogShare(logId);
      await Share.share({ message: response.share.text });
    } catch (_error) {
      Alert.alert('共有に失敗しました', '時間をおいて再度お試しください。');
    } finally {
      setSharingId(null);
    }
  }

  function confirmDelete(logId: string) {
    Alert.alert(t('logs.deleteConfirm.title'), t('logs.deleteConfirm.message'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => void handleDelete(logId),
      },
    ]);
  }

  async function handleDelete(logId: string) {
    try {
      setDeletingId(logId);
      await deleteMealLogEntry(logId);
      invalidateLogQueries();
      Alert.alert(t('logs.deleted.title'), t('logs.deleted.message'), [
        {
          text: t('logs.deleted.undo'),
          onPress: () => void handleUndo(logId),
        },
        { text: t('common.close'), style: 'cancel' },
      ]);
    } catch (error) {
      console.error('Failed to delete meal log', error);
      Alert.alert(t('logs.deleted.failed'));
    } finally {
      setDeletingId(null);
    }
  }

  async function handleUndo(logId: string) {
    try {
      await restoreMealLogEntry(logId);
      invalidateLogQueries();
      Alert.alert(t('logs.restore.success'));
    } catch (error) {
      console.error('Failed to restore meal log', error);
      Alert.alert(t('logs.restore.failed'));
    }
  }

  function invalidateLogQueries() {
    queryClient.invalidateQueries({ queryKey: ['recentLogs'] });
    queryClient.invalidateQueries({ queryKey: ['mealLogs'] });
    queryClient.invalidateQueries({ queryKey: ['dashboardSummary'] });
    queryClient.invalidateQueries({ queryKey: ['streak'] });
  }

  async function handleExport() {
    try {
      setIsExporting(true);
      const { export: dataset } = await getLogsExport(exportRange);
      if (!dataset.items.length) {
        Alert.alert('データがありません', '選択した期間の記録がありません。');
        return;
      }

      if (!cacheDirectory) {
        Alert.alert('ファイルを保存できません', '一時ディレクトリにアクセスできませんでした。');
        return;
      }

      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('共有できません', 'このデバイスではファイル共有がサポートされていません。');
        return;
      }

      const exportItems: ExportItem[] = dataset.items.map((item) => ({
        foodItem: item.foodItem,
        recordedAt: item.recordedAt,
        calories: item.calories,
        proteinG: item.proteinG,
        fatG: item.fatG,
        carbsG: item.carbsG,
      }));

      if (exportFormat === 'csv') {
        const csv = buildCsv(exportItems, locale);
        const fileUri = `${cacheDirectory}meal-logs-${exportRange}-${Date.now()}.csv`;
        await writeAsStringAsync(fileUri, csv, {
          encoding: EncodingType.UTF8,
        });
        try {
          await Sharing.shareAsync(fileUri, {
            mimeType: 'text/csv',
            dialogTitle: 'CSVを共有',
            UTI: 'public.comma-separated-values-text',
          });
        } finally {
          await deleteAsync(fileUri, { idempotent: true });
        }
      } else {
        const html = buildPdfHtml(exportItems, dataset.from, dataset.to, locale);
        const result = await Print.printToFileAsync({ html, base64: false });
        try {
          await Sharing.shareAsync(result.uri, {
            mimeType: 'application/pdf',
            dialogTitle: 'PDFを共有',
            UTI: 'com.adobe.pdf',
          });
        } finally {
          await deleteAsync(result.uri, { idempotent: true });
        }
      }
    } catch (_error) {
      console.error('Failed to export logs', _error);
      Alert.alert('エクスポートに失敗しました', '時間をおいて再度お試しください。');
    } finally {
      setIsExporting(false);
      setExportVisible(false);
    }
  }
}

interface ExportModalProps {
  visible: boolean;
  onClose: () => void;
  range: ExportRange;
  format: 'csv' | 'pdf';
  setRange: (range: ExportRange) => void;
  setFormat: (format: 'csv' | 'pdf') => void;
  onExport: () => Promise<void>;
  exporting: boolean;
}

function ExportModal({ visible, onClose, range, setRange, format, setFormat, onExport, exporting }: ExportModalProps) {
  const rangeOptions: Array<{ key: ExportRange; label: string }> = [
    { key: 'day', label: '今日' },
    { key: 'week', label: '今週' },
    { key: 'month', label: '今月' },
  ];

  const formatOptions: Array<{ key: 'csv' | 'pdf'; label: string }> = [
    { key: 'csv', label: 'CSV' },
    { key: 'pdf', label: 'PDF' },
  ];

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>エクスポート設定</Text>
          <Text style={styles.modalLabel}>期間</Text>
          <View style={styles.optionRow}>
            {rangeOptions.map((option) => (
              <Pressable
                key={option.key}
                style={[styles.optionChip, range === option.key && styles.optionChipActive]}
                onPress={() => setRange(option.key)}
              >
                <Text style={[styles.optionText, range === option.key && styles.optionTextActive]}>{option.label}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.modalLabel}>形式</Text>
          <View style={styles.optionRow}>
            {formatOptions.map((option) => (
              <Pressable
                key={option.key}
                style={[styles.optionChip, format === option.key && styles.optionChipActive]}
                onPress={() => setFormat(option.key)}
              >
                <Text style={[styles.optionText, format === option.key && styles.optionTextActive]}>{option.label}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.modalActions}>
            <TouchableOpacity onPress={onClose} disabled={exporting}>
              <Text style={styles.modalCancel}>キャンセル</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalPrimary, exporting && styles.modalPrimaryDisabled]}
              onPress={onExport}
              disabled={exporting}
            >
              {exporting ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalPrimaryLabel}>出力する</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerActions: {
    flexDirection: 'row',
  },
  heading: {
    ...textStyles.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  rangeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  rangeChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surface,
  },
  rangeChipActive: {
    borderColor: colors.accent,
    backgroundColor: `${colors.accent}11`,
  },
  rangeLabel: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  rangeLabelActive: {
    color: colors.accent,
    fontWeight: '600',
  },
  premiumCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.md,
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  premiumTitle: {
    ...textStyles.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  premiumSubtitle: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  premiumButton: {
    alignSelf: 'flex-start',
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    marginTop: spacing.xs,
  },
  premiumButtonLabel: {
    ...textStyles.caption,
    color: '#fff',
    fontWeight: '600',
  },
  list: {
    gap: spacing.sm,
  },
  item: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    gap: spacing.xs,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemTitle: {
    ...textStyles.body,
    color: colors.textPrimary,
    fontWeight: '600',
    flexShrink: 1,
  },
  itemCalories: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  macrosRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  fallbackNote: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  macroLabel: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  itemFooter: {
    marginTop: spacing.xs,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.xs,
  },
  favoriteToggle: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    alignItems: 'center',
    minWidth: 48,
  },
  favoriteToggleActive: {
    borderColor: colors.accent,
    backgroundColor: `${colors.accent}11`,
  },
  favoriteToggleLabel: {
    ...textStyles.caption,
    color: colors.accent,
    fontWeight: '600',
    textAlign: 'center',
  },
  shareLink: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 12,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    minWidth: 72,
    alignItems: 'center',
  },
  shareLabel: {
    ...textStyles.caption,
    color: colors.accent,
    fontWeight: '600',
  },
  deleteLink: {
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: 12,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    minWidth: 72,
    alignItems: 'center',
  },
  deleteLabel: {
    ...textStyles.caption,
    color: colors.error,
    fontWeight: '600',
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    alignItems: 'center',
    gap: spacing.sm,
  },
  emptyText: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  resetNotice: {
    ...textStyles.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  cta: {
    backgroundColor: colors.accent,
    borderRadius: 16,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
  },
  ctaLabel: {
    ...textStyles.caption,
    color: '#fff',
    fontWeight: '600',
  },
  secondaryCta: {
    ...textStyles.caption,
    color: colors.accent,
    fontWeight: '600',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.lg,
    width: '100%',
    gap: spacing.md,
  },
  modalTitle: {
    ...textStyles.titleSmall,
    color: colors.textPrimary,
  },
  modalLabel: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  optionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  optionChip: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  optionChipActive: {
    borderColor: colors.accent,
    backgroundColor: `${colors.accent}11`,
  },
  optionText: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  optionTextActive: {
    color: colors.accent,
    fontWeight: '600',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  modalCancel: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  modalPrimary: {
    flex: 1,
    backgroundColor: colors.accent,
    borderRadius: 16,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  modalPrimaryDisabled: {
    opacity: 0.5,
  },
  modalPrimaryLabel: {
    ...textStyles.body,
    color: '#fff',
    fontWeight: '600',
  },
});
