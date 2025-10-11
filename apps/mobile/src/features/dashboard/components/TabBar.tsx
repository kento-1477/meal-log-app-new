import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { spacing } from '@/theme/spacing';
import { colors } from '@/theme/colors';
import { textStyles } from '@/theme/typography';
import { useTranslation } from '@/i18n';

type TabKey = 'calories' | 'macros' | 'nutrients';

interface Props {
  active: TabKey;
  onChange: (key: TabKey) => void;
}

const TABS: TabKey[] = ['calories', 'macros', 'nutrients'];

export function TabBar({ active, onChange }: Props) {
  const { t } = useTranslation();
  return (
    <View style={styles.container}>
      {TABS.map((tab) => {
        const isActive = tab === active;
        return (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, isActive && styles.tabActive]}
            onPress={() => onChange(tab)}
            activeOpacity={0.85}
          >
            <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>{tabLabel(tab, t)}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function tabLabel(key: TabKey, t: (key: string) => string) {
  switch (key) {
    case 'calories':
      return t('tab.calories');
    case 'macros':
      return t('tab.macros');
    case 'nutrients':
    default:
      return t('tab.nutrients');
  }
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: 16,
    backgroundColor: colors.surface,
    padding: 4,
    marginBottom: spacing.lg,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: 12,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: colors.accent,
  },
  tabLabel: {
    ...textStyles.caption,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  tabLabelActive: {
    color: '#fff',
  },
});

export type { TabKey };
