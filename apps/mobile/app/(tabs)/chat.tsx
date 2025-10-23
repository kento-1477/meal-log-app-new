import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { colors } from '@/theme/colors';
import { textStyles } from '@/theme/typography';
import { ChatBubble } from '@/components/ChatBubble';
import { NutritionCard } from '@/components/NutritionCard';
import { ErrorBanner } from '@/components/ErrorBanner';
import { useChatStore } from '@/store/chat';
import { useSessionStore } from '@/store/session';
import {
  createFavoriteMeal,
  createLogFromFavorite,
  getFavorites,
  getMealLogShare,
  getStreak,
  postMealLog,
  type MealLogResponse,
  type ApiError,
} from '@/services/api';
import { purchaseCreditPack, IAP_UNSUPPORTED_ERROR } from '@/services/iap';
import { hasDialogBeenSeen, markDialogSeen } from '@/services/dialog-tracker';
import { describeLocale } from '@/utils/locale';
import type { NutritionCardPayload } from '@/types/chat';
import type { AiUsageSummary, FavoriteMeal, FavoriteMealDraft } from '@meal-log/shared';
import { useTranslation } from '@/i18n';

interface TimelineItemMessage {
  type: 'message';
  id: string;
  payload: ReturnType<typeof useChatStore.getState>['messages'][number];
}

interface TimelineItemCard {
  type: 'card';
  id: string;
  payload: NutritionCardPayload;
}

const composeTimeline = (messages: ReturnType<typeof useChatStore.getState>['messages']) =>
  messages.flatMap((message) => {
    const base: TimelineItemMessage = { type: 'message', id: message.id, payload: message };
    if (message.card) {
      const card: TimelineItemCard = { type: 'card', id: `${message.id}-card`, payload: message.card };
      return [base, card];
    }
    return [base];
  });

// ... (rest of the imports)

// ... (Timeline interfaces)

// ... (composeTimeline function)

export default function ChatScreen() {
  const inset = useSafeAreaInsets();
  const router = useRouter();
  const listRef = useRef<FlatList<TimelineItemMessage | TimelineItemCard>>(null);
  const tabBarHeight = useBottomTabBarHeight();
  const queryClient = useQueryClient();
  const { t, locale } = useTranslation();
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [favoritesVisible, setFavoritesVisible] = useState(false);
  const [addingFavoriteId, setAddingFavoriteId] = useState<string | null>(null);
  const [limitModalVisible, setLimitModalVisible] = useState(false);
  const [streakModalVisible, setStreakModalVisible] = useState(false);
  const [iapLoading, setIapLoading] = useState(false);

  const {
    messages,
    addUserMessage,
    addAssistantMessage,
    setMessageText,
    updateMessageStatus,
    attachCardToMessage,
    composingImageUri,
    setComposingImage,
  } = useChatStore();
  const usage = useSessionStore((state) => state.usage);
  const setUsage = useSessionStore((state) => state.setUsage);
  const userPlan = useSessionStore((state) => state.user?.plan ?? 'FREE');
  const isAuthenticated = useSessionStore((state) => state.status === 'authenticated');
  const hasUsage = Boolean(usage);
  const usagePlan = usage?.plan;
  const usageRemaining = usage?.remaining;

  const [mediaPermission, requestMediaPermission] = ImagePicker.useMediaLibraryPermissions();

  const favoritesQuery = useQuery({
    queryKey: ['favorites'],
    queryFn: async () => {
      const response = await getFavorites();
      return response.items;
    },
    enabled: favoritesVisible,
  });

  const streakQuery = useQuery({
    queryKey: ['streak', locale],
    queryFn: async () => {
      const response = await getStreak();
      return response.streak;
    },
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 15,
  });

  const streak = streakQuery.data;
  const hasStreak = Boolean(streak);
  const streakCurrent = streak?.current;
  const streakLastLoggedAt = streak?.lastLoggedAt;

  const createFavoriteMutation = useMutation({
    mutationFn: (draft: FavoriteMealDraft) => createFavoriteMeal(draft),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['favorites'] });
      queryClient.invalidateQueries({ queryKey: ['recentLogs'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardSummary'] });
    },
  });

  useEffect(() => {
    if (favoritesVisible) {
      favoritesQuery.refetch();
    }
  }, [favoritesVisible, favoritesQuery]);

  useEffect(() => {
    if (!hasUsage || usagePlan !== 'FREE' || (usageRemaining ?? 0) > 0) {
      return;
    }
    let cancelled = false;
    const dateToken = new Date().toISOString().slice(0, 10);

    (async () => {
      const seen = await hasDialogBeenSeen('limit', dateToken);
      if (!cancelled && !seen) {
        setLimitModalVisible(true);
        await markDialogSeen('limit', dateToken);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hasUsage, usagePlan, usageRemaining]);

  useEffect(() => {
    if (!hasStreak || userPlan !== 'FREE') {
      return;
    }
    if ((streakCurrent ?? 0) < 30) {
      return;
    }

    let cancelled = false;
    const tokenSource = streakLastLoggedAt ?? new Date().toISOString();
    const token = tokenSource.slice(0, 10);

    (async () => {
      const seen = await hasDialogBeenSeen('streak', token);
      if (!cancelled && !seen) {
        setStreakModalVisible(true);
        await markDialogSeen('streak', token);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hasStreak, streakCurrent, streakLastLoggedAt, userPlan]);

  const timeline = useMemo<Array<TimelineItemMessage | TimelineItemCard>>(() => composeTimeline(messages), [messages]);

  const scrollToEnd = () => {
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  };

  const canSend = !usage || usage.remaining > 0 || usage.credits > 0;

  const favoritesList = favoritesQuery.data ?? [];

  const resetComposer = () => {
    setInput('');
    setComposingImage(null);
  };

  const handleEditLog = (logId: string) => {
    router.push(`/log/${logId}`);
  };

  const submitMeal = async (
    rawMessage: string,
    options: {
      imageUri?: string | null;
      onSuccess?: (response: MealLogResponse) => void;
      request?: () => Promise<MealLogResponse>;
    } = {},
  ) => {
    const trimmedMessage = rawMessage.trim();
    const hasImage = Boolean(options.imageUri);
    if (!trimmedMessage && !hasImage) {
      return null;
    }
    if (usage && !canSend) {
      setError('本日の無料利用回数が上限に達しました。');
      return null;
    }

    setSending(true);
    setError(null);

    const displayMessage = trimmedMessage || rawMessage || '（画像解析）';

    const userMessage = addUserMessage(displayMessage);
    const assistantPlaceholder = addAssistantMessage('解析中です…', { status: 'sending' });
    scrollToEnd();

    try {
      const requestFn =
        options.request ??
        (() =>
          postMealLog({
            message: trimmedMessage || rawMessage,
            imageUri: options.imageUri ?? undefined,
          }));
      const response = await requestFn();
      updateMessageStatus(userMessage.id, 'delivered');

      const summaryText = buildAssistantSummary(response);
      updateMessageStatus(assistantPlaceholder.id, 'delivered');
      const meta = (response.meta ?? {}) as { mealPeriod?: string | null; timezone?: string | null };
      const rawMealPeriod = meta.mealPeriod ?? response.meal_period ?? null;
      const mealPeriod = typeof rawMealPeriod === 'string' ? rawMealPeriod.toLowerCase() : null;
      const timezone = meta.timezone ?? null;
      attachCardToMessage(assistantPlaceholder.id, {
        logId: response.logId,
        dish: response.dish,
        confidence: response.confidence,
        totals: response.totals,
        items: response.items,
        warnings: response.breakdown.warnings,
        locale: response.locale,
        requestedLocale: response.requestLocale,
        fallbackApplied: response.fallbackApplied,
        translations: response.translations,
        favoriteCandidate: response.favoriteCandidate,
        mealPeriod,
        timezone,
      });
      setMessageText(assistantPlaceholder.id, summaryText);
      if (response.usage) {
        setUsage(response.usage);
      }
      queryClient.invalidateQueries({ queryKey: ['recentLogs'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardSummary'] });
      queryClient.invalidateQueries({ queryKey: ['streak'] });
      options.onSuccess?.(response);
      return response;
    } catch (_error) {
      const apiError = _error as ApiError;
      if (apiError.code === 'AI_USAGE_LIMIT') {
        updateMessageStatus(userMessage.id, 'error');
        updateMessageStatus(assistantPlaceholder.id, 'error');
        const payload = apiError.data as AiUsageSummary | undefined;
        if (payload) {
          setUsage(payload);
        }
        setError('本日の利用回数が上限に達しました。');
      } else {
        updateMessageStatus(userMessage.id, 'error');
        updateMessageStatus(assistantPlaceholder.id, 'error');
        setError('エラーが発生しました。もう一度お試しください。');
      }
      return null;
    } finally {
      setSending(false);
      scrollToEnd();
    }
  };

  const handleAddFavoriteFromCard = async (cardId: string, draft: FavoriteMealDraft) => {
    try {
      setAddingFavoriteId(cardId);
      await createFavoriteMutation.mutateAsync(draft);
      Alert.alert('お気に入りに追加しました');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'お気に入りの保存に失敗しました';
      Alert.alert('お気に入りの保存に失敗しました', message);
    } finally {
      setAddingFavoriteId(null);
    }
  };

  const buildMessageFromFavorite = (favorite: FavoriteMeal) => {
    const lines = [favorite.name];
    if (favorite.items.length) {
      const detail = favorite.items
        .slice(0, 4)
        .map((item) => `${item.name} ${Math.round(item.grams)}g`)
        .join(' ／ ');
      lines.push(detail);
    }
    return lines.join('\n');
  };

  const handleFavoriteSelect = async (favorite: FavoriteMeal) => {
    if (sending) {
      return;
    }
    setFavoritesVisible(false);
    const message = buildMessageFromFavorite(favorite);
    await submitMeal(message, {
      onSuccess: resetComposer,
      request: () => createLogFromFavorite(favorite.id),
    });
  };

  const handleSend = async () => {
    const response = await submitMeal(input, {
      imageUri: composingImageUri ?? null,
      onSuccess: resetComposer,
    });
    if (!response) {
      return;
    }
  };

  const ensureMediaLibraryPermission = async () => {
    const current = mediaPermission ?? (await ImagePicker.getMediaLibraryPermissionsAsync());
    if (current?.granted) {
      return current;
    }
    if (current?.canAskAgain) {
      const updated = await requestMediaPermission();
      return updated ?? current;
    }
    return current;
  };

  const handleAttach = async () => {
    try {
      const permission = await ensureMediaLibraryPermission();
      if (!permission?.granted) {
        setError('写真ライブラリへのアクセスを許可してください。設定アプリから変更できます。');
        if (permission && !permission.canAskAgain) {
          Alert.alert('ライブラリにアクセスできません', '設定アプリで Meal Log の写真アクセスを許可してください。');
        }
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.8,
        exif: false,
        selectionLimit: 1,
      });

      if (!result.canceled) {
        const uri = result.assets?.[0]?.uri ?? null;
        if (uri) {
          setComposingImage(uri);
        }
      }
    } catch (error) {
      console.warn('Failed to open media library', error);
      setError('写真の読み込みに失敗しました。もう一度お試しください。');
    }
  };

  const handleShareCard = async (payload: NutritionCardPayload, cardKey: string) => {
    try {
      setSharingId(cardKey);
      let message = buildShareMessage(payload);
      if (payload.logId) {
        try {
          const response = await getMealLogShare(payload.logId);
          message = response.share.text;
        } catch (shareError) {
          console.warn('Failed to fetch share payload, fallback to local data', shareError);
        }
      }
      await Share.share({ message });
    } catch (_error) {
      Alert.alert('共有に失敗しました', '時間をおいて再度お試しください。');
    } finally {
      setSharingId(null);
    }
  };

  const handlePurchaseCredits = async () => {
    try {
      setIapLoading(true);
      const result = await purchaseCreditPack();
      setUsage(result.response.usage);
      queryClient.invalidateQueries({ queryKey: ['streak'] });
      Alert.alert(t('usage.purchase.success'));
      setLimitModalVisible(false);
    } catch (error) {
      const err = error as { code?: string; message?: string } | Error;
      if ((err as any)?.code === 'iap.cancelled') {
        return;
      }
      if ((err as any)?.code === IAP_UNSUPPORTED_ERROR) {
        Alert.alert(t('usage.purchase.unsupported'));
        return;
      }
      const message = err instanceof Error ? err.message : undefined;
      Alert.alert(t('usage.purchase.error'), message);
    } finally {
      setIapLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <Text style={[styles.headerTitle, { paddingHorizontal: 16, marginBottom: 16 }]}>{t('chat.header')}</Text>
      {usage ? (
        <View style={styles.usageBanner}>
          <View style={styles.usageBannerText}>
            <Text style={styles.usageText}>
              {userPlan === 'STANDARD' ? t('usage.plan.standard') : t('usage.plan.free')} ｜{' '}
              {t('usage.banner.remaining', { remaining: usage.remaining, limit: usage.limit })}
            </Text>
            {usage.credits > 0 ? (
              <Text style={styles.usageCredits}>{t('usage.banner.credits', { credits: usage.credits })}</Text>
            ) : null}
          </View>
          {userPlan === 'FREE' ? (
            <TouchableOpacity
              style={[styles.usageAction, iapLoading && styles.usageActionDisabled]}
              onPress={handlePurchaseCredits}
              disabled={iapLoading}
            >
              {iapLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.usageActionLabel}>{t('usage.limitModal.purchase')}</Text>}
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
      {error ? <ErrorBanner message={error} /> : null}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
        keyboardVerticalOffset={tabBarHeight}
      >
        <FlatList
          ref={listRef}
          data={timeline}
          keyExtractor={(item) => item.id}
          contentInsetAdjustmentBehavior="automatic"
          renderItem={({ item }) =>
            item.type === 'message' ? (
              <ChatBubble message={item.payload} />
            ) : (
              <NutritionCard
                payload={item.payload}
                onShare={() => handleShareCard(item.payload, item.id)}
                sharing={sharingId === item.id}
                onAddFavorite={item.payload.favoriteCandidate ? (draft) => handleAddFavoriteFromCard(item.id, draft) : undefined}
                addingFavorite={addingFavoriteId === item.id}
                onEdit={item.payload.logId ? () => handleEditLog(item.payload.logId) : undefined}
              />
            )
          }
          contentContainerStyle={[styles.listContent, { paddingBottom: 120 + inset.bottom }]}
          onContentSizeChange={scrollToEnd}
          showsVerticalScrollIndicator={false}
        />
        <View style={[styles.composer, { paddingBottom: 16 }]}>
          {composingImageUri ? (
            <View style={styles.previewContainer}>
              <Image source={{ uri: composingImageUri }} style={styles.preview} />
              <TouchableOpacity onPress={() => setComposingImage(null)} style={styles.removeImage}>
                <Text style={{ color: '#fff' }}>✕</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          <View style={styles.inputRow}>
            <TouchableOpacity onPress={handleAttach} style={styles.attachButton}>
              <Text style={styles.attachIcon}>＋</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setFavoritesVisible(true)} style={styles.favoriteButton}>
              <Text style={styles.favoriteIcon}>★</Text>
            </TouchableOpacity>
            <TextInput
              style={styles.textInput}
              placeholder="食事内容を入力..."
              value={input}
              onChangeText={setInput}
              multiline
            />
            <TouchableOpacity onPress={handleSend} disabled={sending || !canSend} style={[styles.sendButton, (!canSend || sending) && styles.sendButtonDisabled]}>
              {sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.sendLabel}>{canSend ? '送信' : '上限'}</Text>}
            </TouchableOpacity>
          </View>
          {!canSend ? <Text style={styles.limitHint}>{t('usage.limitHint')}</Text> : null}
        </View>
      </KeyboardAvoidingView>
      <Modal
        visible={favoritesVisible}
        animationType="slide"
        onRequestClose={() => setFavoritesVisible(false)}
      >
        <SafeAreaView style={styles.favoritesModalContainer} edges={['top', 'left', 'right']}>
          <View style={styles.favoritesHeader}>
            <Text style={styles.favoritesTitle}>{t('recentLogs.heading')}</Text>
            <TouchableOpacity onPress={() => setFavoritesVisible(false)}>
              <Text style={styles.favoritesClose}>閉じる</Text>
            </TouchableOpacity>
          </View>
          {favoritesQuery.isLoading ? (
            <View style={styles.favoritesLoading}>
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : favoritesList.length ? (
            <ScrollView contentContainerStyle={styles.favoritesList}>
              {favoritesList.map((favorite) => (
                <TouchableOpacity
                  key={favorite.id}
                  style={styles.favoritesItem}
                  onPress={() => handleFavoriteSelect(favorite)}
                >
                  <Text style={styles.favoritesItemName}>{favorite.name}</Text>
                  <Text style={styles.favoritesItemMeta}>
                    {Math.round(favorite.totals.kcal)} kcal ／ P {formatMacro(favorite.totals.protein_g)}g ／ F {formatMacro(favorite.totals.fat_g)}g ／ C {formatMacro(favorite.totals.carbs_g)}g
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          ) : (
            <View style={styles.favoritesEmpty}>
              <Text style={styles.favoritesEmptyText}>お気に入りがまだ登録されていません。</Text>
            </View>
          )}
        </SafeAreaView>
      </Modal>
      <Modal
        visible={limitModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLimitModalVisible(false)}
      >
        <View style={styles.usageModalBackdrop}>
          <View style={styles.usageModalCard}>
            <Text style={styles.usageModalTitle}>{t('usage.limitModal.title')}</Text>
            <Text style={styles.usageModalMessage}>
              {t('usage.limitModal.message', { limit: usage?.limit ?? 0 })}
            </Text>
            <View style={styles.usageModalActions}>
              <TouchableOpacity
                style={[styles.usageModalPrimary, iapLoading && styles.usageModalDisabled]}
                onPress={handlePurchaseCredits}
                disabled={iapLoading}
              >
                {iapLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.usageModalPrimaryLabel}>{t('usage.limitModal.purchase')}</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setLimitModalVisible(false)}>
                <Text style={styles.usageModalSecondary}>{t('usage.limitModal.close')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <Modal
        visible={streakModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setStreakModalVisible(false)}
      >
        <View style={styles.usageModalBackdrop}>
          <View style={styles.usageModalCard}>
            <Text style={styles.usageModalTitle}>{t('usage.streakModal.title')}</Text>
            <Text style={styles.usageModalMessage}>{t('usage.streakModal.message')}</Text>
            <View style={styles.usageModalActions}>
              <TouchableOpacity
                style={styles.usageModalPrimary}
                onPress={() => {
                  setStreakModalVisible(false);
                  router.push('/(tabs)/settings');
                }}
              >
                <Text style={styles.usageModalPrimaryLabel}>{t('usage.streakModal.upgrade')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setStreakModalVisible(false)}>
                <Text style={styles.usageModalSecondary}>{t('usage.streakModal.close')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function buildAssistantSummary(response: MealLogResponse) {
  const lines = [
    `${response.dish}（${Math.round(response.totals.kcal)} kcal）`,
    `P ${formatMacro(response.totals.protein_g)}g / F ${formatMacro(response.totals.fat_g)}g / C ${formatMacro(response.totals.carbs_g)}g`,
  ];

  if (response.items?.length) {
    const primary = response.items
      .slice(0, 2)
      .map((item) => `${item.name} ${Math.round(item.grams)}g`)
      .join('・');
    lines.push(primary);
  }

  if (response.fallbackApplied && response.requestLocale !== response.locale) {
    const requested = describeLocale(response.requestLocale);
    const resolved = describeLocale(response.locale);
    lines.push(`※ ${requested} の翻訳が未対応のため ${resolved} で表示しています`);
  }

  return lines.join('\n');
}

function buildShareMessage(payload: NutritionCardPayload) {
  const lines = [
    `食事記録: ${payload.dish}`,
    `カロリー: ${Math.round(payload.totals.kcal)} kcal`,
    `P: ${formatMacro(payload.totals.protein_g)} g / F: ${formatMacro(payload.totals.fat_g)} g / C: ${formatMacro(payload.totals.carbs_g)} g`,
  ];

  if (payload.items?.length) {
    lines.push('内訳:');
    payload.items.slice(0, 3).forEach((item) => {
      lines.push(`・${item.name} ${Math.round(item.grams)} g`);
    });
  }

  if (payload.fallbackApplied && payload.requestedLocale && payload.locale && payload.requestedLocale !== payload.locale) {
    lines.push(
      `※ ${describeLocale(payload.requestedLocale)} の翻訳が未対応のため ${describeLocale(payload.locale)} で表示しています`,
    );
  }

  return lines.join('\n');
}

function formatMacro(value: number) {
  return Math.round(value * 10) / 10;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerTitle: {
    ...textStyles.titleLarge,
    color: colors.textPrimary,
  },
  usageBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 8,
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: 12,
  },
  usageBannerText: {
    flex: 1,
    gap: 4,
  },
  usageText: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  usageCredits: {
    ...textStyles.caption,
    color: colors.accent,
  },
  usageAction: {
    backgroundColor: colors.accent,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    minWidth: 120,
    alignItems: 'center',
  },
  usageActionDisabled: {
    opacity: 0.7,
  },
  usageActionLabel: {
    ...textStyles.caption,
    color: '#fff',
    fontWeight: '600',
  },
  usageModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  usageModalCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    gap: 16,
  },
  usageModalTitle: {
    ...textStyles.titleMedium,
    color: colors.textPrimary,
  },
  usageModalMessage: {
    ...textStyles.body,
    color: colors.textSecondary,
  },
  usageModalActions: {
    gap: 12,
  },
  usageModalPrimary: {
    backgroundColor: colors.accent,
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  usageModalPrimaryLabel: {
    ...textStyles.body,
    color: '#fff',
    fontWeight: '600',
  },
  usageModalSecondary: {
    ...textStyles.body,
    color: colors.accent,
    textAlign: 'center',
    fontWeight: '600',
  },
  usageModalDisabled: {
    opacity: 0.6,
  },
  flex: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
  },
  composer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingTop: 12,
    paddingHorizontal: 16,
    gap: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
  },
  attachButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  attachIcon: {
    fontSize: 22,
    color: colors.accent,
  },
  favoriteButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  favoriteIcon: {
    fontSize: 20,
    color: colors.accent,
  },
  textInput: {
    flex: 1,
    maxHeight: 120,
    borderRadius: 16,
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    fontSize: 16,
  },
  sendButton: {
    height: 40,
    borderRadius: 12,
    paddingHorizontal: 18,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: colors.border,
  },
  sendLabel: {
    color: '#fff',
    fontWeight: '600',
  },
  previewContainer: {
    marginBottom: 12,
    position: 'relative',
    alignSelf: 'flex-start',
  },
  preview: {
    width: 120,
    height: 120,
    borderRadius: 12,
  },
  removeImage: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  limitHint: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  favoritesModalContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  favoritesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  favoritesTitle: {
    ...textStyles.titleMedium,
  },
  favoritesClose: {
    ...textStyles.body,
    color: colors.accent,
    fontWeight: '600',
  },
  favoritesLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  favoritesList: {
    padding: 16,
    gap: 12,
  },
  favoritesItem: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    gap: 6,
  },
  favoritesItemName: {
    ...textStyles.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  favoritesItemMeta: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
  favoritesEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  favoritesEmptyText: {
    ...textStyles.caption,
    color: colors.textSecondary,
  },
});
