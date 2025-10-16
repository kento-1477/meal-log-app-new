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
import type { MealLogSummary } from '@meal-log/shared';
import { useRouter } from 'expo-router';
import { cacheDirectory, EncodingType, writeAsStringAsync } from 'expo-file-system';
import * as Print from 'expo-print';
import { useState } from 'react';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { textStyles } from '@/theme/typography';
import { useTranslation } from '@/i18n';
import { getLogsExport, getMealLogShare, type ExportRange } from '@/services/api';

interface Props {
  logs: MealLogSummary[];
}

export function RecentLogsList({ logs }: Props) {
  const router = useRouter();
  const { t } = useTranslation();
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [exportVisible, setExportVisible] = useState(false);
  const [exportRange, setExportRange] = useState<ExportRange>('day');
  const [exportFormat, setExportFormat] = useState<'csv' | 'pdf'>('csv');
  const [isExporting, setIsExporting] = useState(false);

  if (!logs.length) {
    return (
      <View style={styles.container}>
        <Text style={styles.heading}>{t('recentLogs.heading')}</Text>
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>{t('recentLogs.empty')}</Text>
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
            <View style={styles.itemFooter}>
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

      if (exportFormat === 'csv') {
        const csv = buildCsv(dataset.items);
        const fileUri = `${cacheDirectory}meal-logs-${exportRange}-${Date.now()}.csv`;
        await writeAsStringAsync(fileUri, csv, {
          encoding: EncodingType.UTF8,
        });
        await Share.share({ url: fileUri, title: 'CSVを共有' });
      } else {
        const html = buildPdfHtml(dataset.items, dataset.from, dataset.to);
        const result = await Print.printToFileAsync({ html });
        await Share.share({ url: result.uri, title: 'PDFを共有' });
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

function buildCsv(items: Array<{ foodItem: string; recordedAt: string; calories: number; proteinG: number; fatG: number; carbsG: number }>) {
  const header = ['記録日時', '料理名', 'カロリー(kcal)', 'たんぱく質(g)', '脂質(g)', '炭水化物(g)'];
  const rows = items.map((item) => [
    formatJpDatetime(item.recordedAt),
    item.foodItem,
    Math.round(item.calories),
    round1(item.proteinG),
    round1(item.fatG),
    round1(item.carbsG),
  ]);

  return [header, ...rows]
    .map((cols) =>
      cols
        .map((value) => {
          const text = String(value ?? '');
          return text.includes(',') ? `"${text.replace(/"/g, '""')}"` : text;
        })
        .join(','),
    )
    .join('\n');
}

function buildPdfHtml(items: Array<{ foodItem: string; recordedAt: string; calories: number; proteinG: number; fatG: number; carbsG: number }>, from: string, to: string) {
  const rows = items
    .map(
      (item) => `
        <tr>
          <td>${formatJpDatetime(item.recordedAt)}</td>
          <td>${escapeHtml(item.foodItem)}</td>
          <td>${Math.round(item.calories)}</td>
          <td>${round1(item.proteinG)}</td>
          <td>${round1(item.fatG)}</td>
          <td>${round1(item.carbsG)}</td>
        </tr>
      `,
    )
    .join('');

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Hiragino Sans', sans-serif; padding: 24px; }
          h1 { font-size: 20px; margin-bottom: 12px; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #ccc; padding: 8px; text-align: left; font-size: 12px; }
          th { background-color: #f4f4f4; }
        </style>
      </head>
      <body>
        <h1>食事記録 (${formatJpDatetime(from)} 〜 ${formatJpDatetime(to)})</h1>
        <table>
          <thead>
            <tr>
              <th>記録日時</th>
              <th>料理名</th>
              <th>カロリー(kcal)</th>
              <th>たんぱく質(g)</th>
              <th>脂質(g)</th>
              <th>炭水化物(g)</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </body>
    </html>
  `;
}

function formatJpDatetime(iso: string) {
  return new Date(iso).toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function escapeHtml(input: string) {
  return input.replace(/[&<>"]/g, (match) => {
    switch (match) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return match;
    }
  });
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
  macroLabel: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  itemFooter: {
    marginTop: spacing.xs,
    alignItems: 'flex-end',
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
