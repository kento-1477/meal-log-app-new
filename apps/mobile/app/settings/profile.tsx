import { useEffect, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@/i18n';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { textStyles } from '@/theme/typography';
import { getUserProfile, updateUserProfile, getPremiumStatus, type UpdateUserProfileRequest } from '@/services/api';
import { usePremiumStore } from '@/store/premium';
import ProfileField, { mapProfileToForm, buildProfilePayload, INITIAL_FORM_STATE } from '@/screen-components/settings/profile-helpers';

export default function ProfileScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(INITIAL_FORM_STATE);
  const setPremiumStatus = usePremiumStore((state) => state.setStatus);

  const profileQuery = useQuery({
    queryKey: ['profile'],
    queryFn: getUserProfile,
  });

  useEffect(() => {
    if (profileQuery.data) {
      setForm(mapProfileToForm(profileQuery.data));
    }
  }, [profileQuery.data]);

  const mutation = useMutation({
    mutationFn: (payload: UpdateUserProfileRequest) => updateUserProfile(payload),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      setForm(mapProfileToForm(result.profile));
      Alert.alert(t('settings.profile.savedTitle'), t('settings.profile.savedMessage'));
      if (result.referralClaimed && result.referralResult) {
        Alert.alert(
          '🎉 プレミアムを獲得しました！',
          `${result.referralResult.premiumDays}日間のプレミアムが付与されました。${result.referralResult.referrerUsername ?? ''}`.trim(),
        );
        getPremiumStatus()
          .then((status) => setPremiumStatus(status))
          .catch((error) => console.warn('Failed to refresh premium status', error));
      }
    },
    onError: () => {
      Alert.alert(t('settings.profile.errorTitle'), t('settings.profile.errorMessage'));
    },
  });

  const handleSave = () => {
    const payload = buildProfilePayload(form);
    if (!payload) {
      Alert.alert(t('settings.profile.validationTitle'), t('settings.profile.validationMessage'));
      return;
    }
    mutation.mutate(payload);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>{t('settings.profile.screenTitle')}</Text>
          <View style={styles.formStack}>
            <ProfileField
              label="表示名"
              value={form.displayName}
              onChangeText={(value) => setForm((prev) => ({ ...prev, displayName: value }))}
              placeholder="meal 太郎"
              keyboardType="default"
            />
            <ProfileField
              label="身長"
              value={form.height}
              onChangeText={(value) => setForm((prev) => ({ ...prev, height: value }))}
              placeholder="170"
              suffix="cm"
            />
            <ProfileField
              label="現在の体重"
              value={form.currentWeight}
              onChangeText={(value) => setForm((prev) => ({ ...prev, currentWeight: value }))}
              placeholder="65"
              suffix="kg"
            />
            <ProfileField
              label="目標体重"
              value={form.targetWeight}
              onChangeText={(value) => setForm((prev) => ({ ...prev, targetWeight: value }))}
              placeholder="60"
              suffix="kg"
            />
            <ProfileField
              label={t('settings.profile.targetCalories')}
              value={form.targetCalories}
              onChangeText={(value) => setForm((prev) => ({ ...prev, targetCalories: value }))}
              placeholder="2000"
              suffix="kcal"
            />
            <View style={styles.inlineRow}>
              <ProfileField
                label={t('settings.profile.targetProtein')}
                value={form.targetProtein}
                onChangeText={(value) => setForm((prev) => ({ ...prev, targetProtein: value }))}
                placeholder="120"
                suffix="g"
                row
              />
              <ProfileField
                label={t('settings.profile.targetFat')}
                value={form.targetFat}
                onChangeText={(value) => setForm((prev) => ({ ...prev, targetFat: value }))}
                placeholder="60"
                suffix="g"
                row
              />
            </View>
            <ProfileField
              label={t('settings.profile.targetCarbs')}
              value={form.targetCarbs}
              onChangeText={(value) => setForm((prev) => ({ ...prev, targetCarbs: value }))}
              placeholder="250"
              suffix="g"
            />
            <ProfileField
              label={t('settings.profile.bodyWeight')}
              value={form.bodyWeight}
              onChangeText={(value) => setForm((prev) => ({ ...prev, bodyWeight: value }))}
              placeholder="60"
              suffix="kg"
            />
            <ProfileField
              label={t('settings.profile.activityLevel')}
              value={form.activityLevel}
              onChangeText={(value) => setForm((prev) => ({ ...prev, activityLevel: value }))}
              placeholder={t('settings.profile.activityPlaceholder')}
            />
            <ProfileField
              label="プラン強度 (GENTLE / STANDARD / INTENSE)"
              value={form.planIntensity}
              onChangeText={(value) => setForm((prev) => ({ ...prev, planIntensity: value }))}
              placeholder="STANDARD"
              keyboardType="default"
            />
            <ProfileField
              label="流入チャネル"
              value={form.marketingSource}
              onChangeText={(value) => setForm((prev) => ({ ...prev, marketingSource: value }))}
              placeholder="Instagram"
              keyboardType="default"
            />
            <ProfileField
              label={t('settings.profile.referralCode')}
              value={form.marketingReferralCode}
              onChangeText={(value) => setForm((prev) => ({ ...prev, marketingReferralCode: value }))}
              placeholder={t('settings.profile.referralPlaceholder')}
              keyboardType="default"
            />
            <ProfileField
              label="目標のキーワード (カンマ区切り)"
              value={form.goals}
              onChangeText={(value) => setForm((prev) => ({ ...prev, goals: value }))}
              placeholder="ダイエット, 筋肉を増やす"
              keyboardType="default"
            />
            <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
              <Text style={styles.saveButtonLabel}>{t('settings.profile.save')}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xl,
  },
  title: {
    ...textStyles.titleLarge,
    color: colors.textPrimary,
  },
  formStack: {
    gap: spacing.md,
  },
  inlineRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  saveButton: {
    backgroundColor: colors.accent,
    borderRadius: 18,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  saveButtonLabel: {
    ...textStyles.body,
    color: '#fff',
    fontWeight: '600',
  },
});
