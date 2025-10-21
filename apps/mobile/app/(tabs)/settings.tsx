import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Constants from 'expo-constants';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { textStyles } from '@/theme/typography';
import { useSessionStore } from '@/store/session';
import { useChatStore } from '@/store/chat';
import {
  deleteAccount,
  getUserProfile,
  logout,
  updateUserProfile,
  type UserProfile,
  type UpdateUserProfileRequest,
} from '@/services/api';
import { useTranslation, SUPPORTED_LOCALES, type Locale } from '@/i18n';
import { describeLocale } from '@/utils/locale';
import {
  PRIVACY_POLICY_URL,
  TERMS_OF_SERVICE_URL,
  OSS_LICENSE_URL,
  SUPPORT_EMAIL,
} from '@/config/legal';

interface ProfileFormState {
  targetCalories: string;
  targetProtein: string;
  targetFat: string;
  targetCarbs: string;
  bodyWeight: string;
  activityLevel: string;
}

const INITIAL_FORM: ProfileFormState = {
  targetCalories: '',
  targetProtein: '',
  targetFat: '',
  targetCarbs: '',
  bodyWeight: '',
  activityLevel: '',
};

export default function SettingsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const user = useSessionStore((state) => state.user);
  const status = useSessionStore((state) => state.status);
  const locale = useSessionStore((state) => state.locale);
  const setLocale = useSessionStore((state) => state.setLocale);
  const setUser = useSessionStore((state) => state.setUser);
  const setUsage = useSessionStore((state) => state.setUsage);
  const resetChat = useChatStore((state) => state.reset);

  const [profileForm, setProfileForm] = useState<ProfileFormState>(INITIAL_FORM);
  const [profileLoaded, setProfileLoaded] = useState(false);

  const profileQuery = useQuery({
    queryKey: ['profile'],
    queryFn: async () => await getUserProfile(),
    enabled: status === 'authenticated',
  });

  useEffect(() => {
    if (profileQuery.data) {
      setProfileForm(mapProfileToForm(profileQuery.data));
      setProfileLoaded(true);
    }
  }, [profileQuery.data]);

  const updateProfileMutation = useMutation({
    mutationFn: async (payload: UpdateUserProfileRequest) => updateUserProfile(payload),
    onSuccess: (profile) => {
      setProfileForm(mapProfileToForm(profile));
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      Alert.alert(t('settings.profile.savedTitle'), t('settings.profile.savedMessage'));
    },
    onError: () => {
      Alert.alert(t('settings.profile.errorTitle'), t('settings.profile.errorMessage'));
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await logout();
    },
    onSuccess: () => {
      setUsage(null);
      setUser(null);
      resetChat();
      router.replace('/login');
    },
    onError: () => {
      Alert.alert(t('settings.account.logoutError'));
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: async () => deleteAccount(),
    onSuccess: () => {
      setUsage(null);
      setUser(null);
      resetChat();
      router.replace('/login');
      Alert.alert(t('settings.account.deleteSuccessTitle'), t('settings.account.deleteSuccessMessage'));
    },
    onError: () => {
      Alert.alert(t('settings.account.deleteErrorTitle'), t('settings.account.deleteErrorMessage'));
    },
  });

  const localeOptions = useMemo(
    () =>
      SUPPORTED_LOCALES.map((value) => ({
        value,
        label: describeLocale(value),
      })),
    [],
  );

  const handleLocaleChange = (next: Locale) => {
    if (next !== locale) {
      setLocale(next);
      Alert.alert(t('settings.language.changedTitle'), t('settings.language.changedMessage'));
    }
  };

  const handleProfileSave = () => {
    const payload = buildProfilePayload(profileForm);
    if (!payload) {
      Alert.alert(t('settings.profile.validationTitle'), t('settings.profile.validationMessage'));
      return;
    }
    updateProfileMutation.mutate(payload);
  };

  const handlePasswordSupport = () => {
    const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Password reset request')}`;
    void Linking.openURL(url);
  };

  const handleOpenLink = (url: string) => {
    void Linking.openURL(url);
  };

  const handleFeedback = () => {
    const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Meal Log feedback')}`;
    void Linking.openURL(url);
  };

  const confirmDeleteAccount = () => {
    Alert.alert(t('settings.account.deleteTitle'), t('settings.account.deleteMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('settings.account.deleteConfirm'),
        style: 'destructive',
        onPress: () => deleteAccountMutation.mutate(),
      },
    ]);
  };

  const versionLabel = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.section.account')}</Text>
          <View style={styles.card}>
            <Text style={styles.label}>{t('settings.account.email')}</Text>
            <Text style={styles.value}>{user?.email ?? t('settings.account.guest')}</Text>
            <View style={styles.rowGap}>
              <TouchableOpacity style={styles.primaryButton} onPress={() => logoutMutation.mutate()} disabled={logoutMutation.isPending}>
                {logoutMutation.isPending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryButtonLabel}>{t('settings.account.logout')}</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButton} onPress={handlePasswordSupport}>
                <Text style={styles.secondaryButtonLabel}>{t('settings.account.changePassword')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.destructiveButton, deleteAccountMutation.isPending && styles.destructiveButtonDisabled]}
                onPress={confirmDeleteAccount}
                disabled={deleteAccountMutation.isPending}
              >
                {deleteAccountMutation.isPending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.destructiveButtonLabel}>{t('settings.account.deleteAccount')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.section.language')}</Text>
          <View style={styles.card}>
            {localeOptions.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={styles.localeRow}
                onPress={() => handleLocaleChange(option.value)}
                accessibilityRole="radio"
                accessibilityState={{ checked: option.value === locale }}
              >
                <View style={[styles.radioOuter, option.value === locale && styles.radioOuterActive]}>
                  {option.value === locale ? <View style={styles.radioInner} /> : null}
                </View>
                <Text style={styles.localeLabel}>{option.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.section.profile')}</Text>
          <View style={styles.card}>
            {!profileLoaded && profileQuery.isLoading ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <>
                <ProfileField
                  label={t('settings.profile.targetCalories')}
                  value={profileForm.targetCalories}
                  onChangeText={(value) => setProfileForm((prev) => ({ ...prev, targetCalories: value }))}
                  placeholder="2000"
                  suffix="kcal"
                />
                <View style={styles.inlineRow}>
                  <ProfileField
                    label={t('settings.profile.targetProtein')}
                    value={profileForm.targetProtein}
                    onChangeText={(value) => setProfileForm((prev) => ({ ...prev, targetProtein: value }))}
                    placeholder="120"
                    suffix="g"
                    row
                  />
                  <ProfileField
                    label={t('settings.profile.targetFat')}
                    value={profileForm.targetFat}
                    onChangeText={(value) => setProfileForm((prev) => ({ ...prev, targetFat: value }))}
                    placeholder="60"
                    suffix="g"
                    row
                  />
                </View>
                <ProfileField
                  label={t('settings.profile.targetCarbs')}
                  value={profileForm.targetCarbs}
                  onChangeText={(value) => setProfileForm((prev) => ({ ...prev, targetCarbs: value }))}
                  placeholder="250"
                  suffix="g"
                />
                <ProfileField
                  label={t('settings.profile.bodyWeight')}
                  value={profileForm.bodyWeight}
                  onChangeText={(value) => setProfileForm((prev) => ({ ...prev, bodyWeight: value }))}
                  placeholder="60"
                  suffix="kg"
                />
                <ProfileField
                  label={t('settings.profile.activityLevel')}
                  value={profileForm.activityLevel}
                  onChangeText={(value) => setProfileForm((prev) => ({ ...prev, activityLevel: value }))}
                  placeholder={t('settings.profile.activityPlaceholder')}
                />
                <TouchableOpacity
                  style={[styles.primaryButton, updateProfileMutation.isPending && styles.primaryButtonDisabled]}
                  onPress={handleProfileSave}
                  disabled={updateProfileMutation.isPending}
                >
                  {updateProfileMutation.isPending ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.primaryButtonLabel}>{t('settings.profile.save')}</Text>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.section.notifications')}</Text>
          <View style={styles.cardRow}>
            <Text style={styles.body}>{t('settings.notifications.placeholder')}</Text>
            <Switch value={false} disabled trackColor={{ false: colors.border, true: colors.accent }} />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.section.legal')}</Text>
          <View style={styles.card}>
            <TouchableOpacity style={styles.linkRow} onPress={() => handleOpenLink(PRIVACY_POLICY_URL)}>
              <Text style={styles.linkLabel}>{t('settings.legal.privacy')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.linkRow} onPress={() => handleOpenLink(TERMS_OF_SERVICE_URL)}>
              <Text style={styles.linkLabel}>{t('settings.legal.terms')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.linkRow} onPress={() => handleOpenLink(OSS_LICENSE_URL)}>
              <Text style={styles.linkLabel}>{t('settings.legal.oss')}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.section.feedback')}</Text>
          <View style={styles.card}>
            <Text style={styles.body}>{t('settings.feedback.description')}</Text>
            <TouchableOpacity style={styles.secondaryButton} onPress={handleFeedback}>
              <Text style={styles.secondaryButtonLabel}>{t('settings.feedback.sendMail')}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.section.about')}</Text>
          <View style={styles.card}>
            <Text style={styles.body}>{t('settings.about.version', { version: versionLabel })}</Text>
            <Text style={styles.caption}>{t('settings.about.developer')}</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function mapProfileToForm(profile: UserProfile): ProfileFormState {
  return {
    targetCalories: toInput(profile.target_calories),
    targetProtein: toInput(profile.target_protein_g),
    targetFat: toInput(profile.target_fat_g),
    targetCarbs: toInput(profile.target_carbs_g),
    bodyWeight: toInput(profile.body_weight_kg),
    activityLevel: profile.activity_level ?? '',
  };
}

function toInput(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value);
}

function buildProfilePayload(form: ProfileFormState): UpdateUserProfileRequest | null {
  const payload: UpdateUserProfileRequest = {};

  const calories = parseNullableNumber(form.targetCalories, true);
  const protein = parseNullableNumber(form.targetProtein, false);
  const fat = parseNullableNumber(form.targetFat, false);
  const carbs = parseNullableNumber(form.targetCarbs, false);
  const weight = parseNullableNumber(form.bodyWeight, false);

  if (calories === undefined || protein === undefined || fat === undefined || carbs === undefined || weight === undefined) {
    return null;
  }

  payload.target_calories = calories;
  payload.target_protein_g = protein;
  payload.target_fat_g = fat;
  payload.target_carbs_g = carbs;
  payload.body_weight_kg = weight;
  payload.activity_level = form.activityLevel.trim() ? form.activityLevel.trim() : null;

  return payload;
}

function parseNullableNumber(value: string, integerOnly: boolean) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  if (integerOnly && !Number.isInteger(parsed)) {
    return undefined;
  }
  return parsed;
}

function ProfileField({
  label,
  value,
  onChangeText,
  placeholder,
  suffix,
  row = false,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  suffix?: string;
  row?: boolean;
}) {
  return (
    <View style={[styles.fieldContainer, row && styles.fieldContainerRow]}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.fieldInputRow}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          keyboardType="decimal-pad"
        />
        {suffix ? <Text style={styles.suffix}>{suffix}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xl * 2,
    gap: spacing.lg,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    ...textStyles.subheading,
    color: colors.textPrimary,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardRow: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowGap: {
    gap: spacing.sm,
  },
  label: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  value: {
    ...textStyles.body,
    color: colors.textPrimary,
  },
  body: {
    ...textStyles.body,
    color: colors.textSecondary,
  },
  caption: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  primaryButton: {
    backgroundColor: colors.accent,
    borderRadius: 16,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonLabel: {
    ...textStyles.body,
    color: '#fff',
    fontWeight: '600',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 16,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  secondaryButtonLabel: {
    ...textStyles.body,
    color: colors.accent,
    fontWeight: '600',
  },
  destructiveButton: {
    backgroundColor: colors.error,
    borderRadius: 16,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  destructiveButtonDisabled: {
    opacity: 0.6,
  },
  destructiveButtonLabel: {
    ...textStyles.body,
    color: '#fff',
    fontWeight: '600',
  },
  localeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  radioOuter: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterActive: {
    borderColor: colors.accent,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.accent,
  },
  localeLabel: {
    ...textStyles.body,
    color: colors.textPrimary,
  },
  fieldContainer: {
    gap: spacing.xs,
  },
  fieldContainerRow: {
    flex: 1,
  },
  fieldInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.sm,
  },
  input: {
    flex: 1,
    paddingVertical: spacing.xs,
    fontSize: 16,
  },
  suffix: {
    ...textStyles.caption,
    color: colors.textSecondary,
    marginLeft: spacing.sm,
  },
  inlineRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  linkRow: {
    paddingVertical: spacing.xs,
  },
  linkLabel: {
    ...textStyles.body,
    color: colors.accent,
    fontWeight: '600',
  },
});
