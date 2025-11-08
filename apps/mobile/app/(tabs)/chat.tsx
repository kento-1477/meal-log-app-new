import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Keyboard,
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
  useWindowDimensions,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { colors } from '@/theme/colors';
import { textStyles } from '@/theme/typography';
import { ChatBubble } from '@/components/ChatBubble';
import { NutritionCard } from '@/components/NutritionCard';
import { ErrorBanner } from '@/components/ErrorBanner';
import { AuroraBackground } from '@/components/AuroraBackground';
import { BrandHeader } from '@/components/BrandHeader';
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
import { hasDialogBeenSeen, markDialogSeen } from '@/services/dialog-tracker';
import { describeLocale } from '@/utils/locale';
import type { ChatMessage, NutritionCardPayload } from '@/types/chat';
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

const NETWORK_HINT_DELAY_IMAGE_MS = 30000;
const NETWORK_HINT_DELAY_TEXT_MS = 15000;
const NETWORK_ERROR_PATTERNS = [
  'Network request failed',
  'The network connection was lost',
  'A server with the specified hostname could not be found',
  'offline',
  'timed out',
];

function isLikelyNetworkError(error: unknown): boolean {
  if (!error) {
    return false;
  }
  if (error instanceof TypeError) {
    return true;
  }
  const message = typeof (error as { message?: unknown }).message === 'string' ? (error as { message: string }).message : '';
  return NETWORK_ERROR_PATTERNS.some((pattern) => message.toLowerCase().includes(pattern.toLowerCase()));
}

// ... (rest of the imports)

// ... (Timeline interfaces)

// ... (composeTimeline function)

export default function ChatScreen() {
  const inset = useSafeAreaInsets();
  const router = useRouter();
  const listRef = useRef<FlatList<TimelineItemMessage | TimelineItemCard>>(null);
  const tabBarHeight = useBottomTabBarHeight();
  const windowHeight = useWindowDimensions().height;
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
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [bottomSectionHeight, setBottomSectionHeight] = useState(0);
  const networkHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setUser = useSessionStore((state) => state.setUser);
  const setStatus = useSessionStore((state) => state.setStatus);

  const clearNetworkHintTimer = useCallback(() => {
    if (networkHintTimerRef.current) {
      clearTimeout(networkHintTimerRef.current);
      networkHintTimerRef.current = null;
    }
  }, []);

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

  const prevMessagesRef = useRef<ChatMessage[] | null>(null);
  const [enhancedExchange, setEnhancedExchange] = useState<{ user: ChatMessage; assistant: ChatMessage | null } | null>(null);

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }, []);

  const handleTemplateInsert = useCallback(() => {
    const template = [t('meal.breakfast'), t('meal.lunch'), t('meal.dinner')]
      .map((label) => `${label}: `)
      .join('\n');
    setInput((prev) => {
      if (!prev.trim()) {
        return template;
      }
      const trimmed = prev.trimEnd();
      const spacer = trimmed.endsWith('\n') ? '' : '\n\n';
      return `${trimmed}${spacer}${template}`;
    });
    requestAnimationFrame(() => scrollToEnd());
  }, [t, setInput, scrollToEnd]);

  type QuickAction = {
    key: string;
    icon: React.ComponentProps<typeof Feather>['name'];
    label: string;
    onPress: () => void;
  };

  const quickActions: QuickAction[] = [
    { key: 'photo', icon: 'camera', label: t('chat.quickActions.photo'), onPress: handlePhotoQuickAction },
    { key: 'favorite', icon: 'star', label: t('chat.quickActions.favorite'), onPress: () => setFavoritesVisible(true) },
  ];

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

  useEffect(() => () => clearNetworkHintTimer(), [clearNetworkHintTimer]);
  useEffect(() => {
    const showEvent = Platform.select({ ios: 'keyboardWillShow', android: 'keyboardDidShow', default: 'keyboardDidShow' })!;
    const hideEvent = Platform.select({ ios: 'keyboardWillHide', android: 'keyboardDidHide', default: 'keyboardDidHide' })!;
    const show = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const streak = streakQuery.data;
  const hasStreak = Boolean(streak);
  const streakCurrent = streak?.current;
  const streakLastLoggedAt = streak?.lastLoggedAt;

  const createFavoriteMutation = useMutation({
    mutationFn: (draft: FavoriteMealDraft) => createFavoriteMeal(draft),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['favorites'] });
      queryClient.invalidateQueries({ queryKey: ['recentLogs'] });
      queryClient.invalidateQueries({ queryKey: ['mealLogs'] });
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

  useEffect(() => {
    const prev = prevMessagesRef.current;
    const userCount = messages.filter((message) => message.role === 'user').length;

    if (!prev) {
      prevMessagesRef.current = messages;
      return;
    }

    if (userCount <= 1) {
      if (enhancedExchange) {
        setEnhancedExchange(null);
      }
      prevMessagesRef.current = messages;
      return;
    }

    const prevUserCount = prev.filter((message) => message.role === 'user').length;
    let lastUserIndex = -1;
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].role === 'user') {
        lastUserIndex = i;
        break;
      }
    }

    const lastUser = lastUserIndex >= 0 ? messages[lastUserIndex] : null;
    const assistantAfterUser =
      lastUserIndex >= 0 ? messages.slice(lastUserIndex + 1).find((message) => message.role === 'assistant') ?? null : null;

    const shouldUpdateOnNewUser = userCount > prevUserCount && lastUser !== null;
    const isDifferentUser = lastUser && enhancedExchange && enhancedExchange.user.id !== lastUser.id;
    const assistantNowPresent = lastUser && enhancedExchange && enhancedExchange.user.id === lastUser.id && !enhancedExchange.assistant && assistantAfterUser;
    const assistantUpdated =
      lastUser &&
      enhancedExchange &&
      assistantAfterUser &&
      enhancedExchange.user.id === lastUser.id &&
      enhancedExchange.assistant?.id === assistantAfterUser.id &&
      enhancedExchange.assistant !== assistantAfterUser;

    if (shouldUpdateOnNewUser || isDifferentUser || assistantNowPresent || assistantUpdated) {
      if (lastUser) {
        setEnhancedExchange({ user: lastUser, assistant: assistantAfterUser });
        requestAnimationFrame(() => scrollToEnd());
      }
    }

    prevMessagesRef.current = messages;
  }, [messages, enhancedExchange, scrollToEnd]);

  const timeline = useMemo<Array<TimelineItemMessage | TimelineItemCard>>(() => composeTimeline(messages), [messages]);

  const filteredTimeline = useMemo(() => {
    if (!enhancedExchange) {
      return timeline;
    }
    const excludedMessageIds = new Set<string>([enhancedExchange.user.id]);
    if (enhancedExchange.assistant) {
      excludedMessageIds.add(enhancedExchange.assistant.id);
    }
    return timeline.filter((item) => {
      if (item.type === 'message') {
        return !excludedMessageIds.has(item.payload.id);
      }
      if (item.type === 'card' && enhancedExchange.assistant) {
        return item.id !== `${enhancedExchange.assistant.id}-card`;
      }
      return true;
    });
  }, [timeline, enhancedExchange]);

  const enhancedContainerMinHeight = useMemo(() => {
    if (!enhancedExchange) {
      return undefined;
    }
    const headerAllowance = inset.top + 120;
    return Math.max(windowHeight - (tabBarHeight + headerAllowance), 320);
  }, [enhancedExchange, inset.top, tabBarHeight, windowHeight]);

  const canSend = !usage || usage.remaining > 0 || usage.credits > 0;
  const hasTypedInput = input.trim().length > 0;
  const sendButtonDisabled = sending || !canSend || !hasTypedInput;

  const favoritesList = favoritesQuery.data ?? [];
  const sendLabel = canSend ? t('chat.send') : t('chat.send.limit');

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
      allowWithoutUsage?: boolean;
    } = {},
  ) => {
    const trimmedMessage = rawMessage.trim();
    const hasImage = Boolean(options.imageUri);
    if (!trimmedMessage && !hasImage) {
      return null;
    }
    if (usage && !canSend && !options.allowWithoutUsage) {
      setError('本日の無料利用回数が上限に達しました。');
      return null;
    }

    clearNetworkHintTimer();
    setSending(true);
    setError(null);

    const displayMessage = trimmedMessage || rawMessage || '（画像解析）';

    const userMessage = addUserMessage(displayMessage);
    const assistantPlaceholder = addAssistantMessage('解析中です…', { status: 'sending' });
    const hintDelay = hasImage ? NETWORK_HINT_DELAY_IMAGE_MS : NETWORK_HINT_DELAY_TEXT_MS;
    networkHintTimerRef.current = setTimeout(() => {
      setMessageText(
        assistantPlaceholder.id,
        `解析中です…\n${t('chat.networkSlowWarning')}`,
      );
    }, hintDelay);
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

      updateMessageStatus(assistantPlaceholder.id, 'delivered');
      renderMealLogResult(response, assistantPlaceholder.id);
      if (response.usage) {
        setUsage(response.usage);
      }
      queryClient.invalidateQueries({ queryKey: ['recentLogs'] });
      queryClient.invalidateQueries({ queryKey: ['mealLogs'] });
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
        setMessageText(assistantPlaceholder.id, t('chat.usageLimitBubble'));
      } else if (apiError.status === 401) {
        updateMessageStatus(userMessage.id, 'error');
        updateMessageStatus(assistantPlaceholder.id, 'error');
        setUser(null);
        setUsage(null);
        setStatus('unauthenticated');
        setError('セッションの有効期限が切れました。再度ログインしてください。');
        setMessageText(assistantPlaceholder.id, t('chat.sessionExpiredBubble'));
      } else if (isLikelyNetworkError(apiError)) {
        updateMessageStatus(userMessage.id, 'error');
        updateMessageStatus(assistantPlaceholder.id, 'error');
        setMessageText(assistantPlaceholder.id, t('chat.networkErrorBubble'));
        setError(t('chat.networkErrorBanner'));
      } else {
        updateMessageStatus(userMessage.id, 'error');
        updateMessageStatus(assistantPlaceholder.id, 'error');
        setError('エラーが発生しました。もう一度お試しください。');
        setMessageText(assistantPlaceholder.id, t('chat.genericErrorBubble'));
      }
      return null;
    } finally {
      clearNetworkHintTimer();
      setSending(false);
      scrollToEnd();
    }
  };

  const renderMealLogResult = (response: MealLogResponse, placeholderId: string) => {
    const meta = (response.meta ?? {}) as { mealPeriod?: string | null; timezone?: string | null };
    const rawMealPeriod = meta.mealPeriod ?? response.meal_period ?? null;
    const mealPeriod = typeof rawMealPeriod === 'string' ? rawMealPeriod.toLowerCase() : null;
    const timezone = meta.timezone ?? null;

    attachCardToMessage(placeholderId, {
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
    setMessageText(placeholderId, buildAssistantSummary(response));
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
    setSending(true);
    setError(null);

    const message = buildMessageFromFavorite(favorite);
    const userMessage = addUserMessage(message);
    const assistantPlaceholder = addAssistantMessage('お気に入りを記録しています…', { status: 'sending' });
    scrollToEnd();

    try {
      const response = await createLogFromFavorite(favorite.id);
      updateMessageStatus(userMessage.id, 'delivered');
      updateMessageStatus(assistantPlaceholder.id, 'delivered');
      renderMealLogResult(response, assistantPlaceholder.id);
      if (response.usage) {
        setUsage(response.usage);
      }
      queryClient.invalidateQueries({ queryKey: ['recentLogs'] });
      queryClient.invalidateQueries({ queryKey: ['mealLogs'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardSummary'] });
      queryClient.invalidateQueries({ queryKey: ['streak'] });
      queryClient.invalidateQueries({ queryKey: ['favorites'] });
      resetComposer();
    } catch (error) {
      updateMessageStatus(userMessage.id, 'error');
      updateMessageStatus(assistantPlaceholder.id, 'error');
      const messageText = error instanceof Error ? error.message : 'お気に入りからの記録に失敗しました';
      setError(messageText);
      Alert.alert('記録に失敗しました', messageText);
    } finally {
      setSending(false);
      scrollToEnd();
    }
  };

  const handleSend = async () => {
    const response = await submitMeal(input, {
      imageUri: composingImageUri ?? null,
      onSuccess: resetComposer,
    });
    if (!response) {
      return;
    }
    Keyboard.dismiss();
  };

  const ensureMediaLibraryPermission = useCallback(async () => {
    const current = mediaPermission ?? (await ImagePicker.getMediaLibraryPermissionsAsync());
    if (current?.granted) {
      return current;
    }
    if (current?.canAskAgain) {
      const updated = await requestMediaPermission();
      return updated ?? current;
    }
    return current;
  }, [mediaPermission, requestMediaPermission]);

  const handleAttach = useCallback(async () => {
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
  }, [ensureMediaLibraryPermission, setError, setComposingImage]);

  const handlePlusPress = () => {
    const templateLabel = t('chat.actions.insertTemplate');
    const photoLabel = t('chat.actions.attachPhoto');
    const cancelLabel = t('common.cancel');
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [templateLabel, photoLabel, cancelLabel],
          cancelButtonIndex: 2,
        },
        (buttonIndex) => {
          if (buttonIndex === 0) {
            handleTemplateInsert();
          } else if (buttonIndex === 1) {
            void handleAttach();
          }
        },
      );
    } else {
      Alert.alert('', '', [
        { text: templateLabel, onPress: () => handleTemplateInsert() },
        { text: photoLabel, onPress: () => void handleAttach() },
        { text: cancelLabel, style: 'cancel' },
      ]);
    }
  };
  const handlePhotoQuickAction = useCallback(() => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [t('chat.actions.attachPhoto'), t('common.cancel')],
          cancelButtonIndex: 1,
        },
        (buttonIndex) => {
          if (buttonIndex === 0) {
            void handleAttach();
          }
        },
      );
    } else {
      void handleAttach();
    }
  }, [handleAttach, t]);

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

  const handleOpenPaywall = useCallback(() => {
    router.push('/paywall');
  }, [router]);

  const renderEnhancedFooter = () => {
    if (!enhancedExchange || !enhancedContainerMinHeight) {
      return null;
    }

    const assistantCard = enhancedExchange.assistant?.card ?? null;
    const assistantCardId = enhancedExchange.assistant ? `${enhancedExchange.assistant.id}-card` : null;

    const assistantHasCard = Boolean(enhancedExchange.assistant?.card);
    const assistantBubbleMessage =
      assistantHasCard && enhancedExchange.assistant
        ? { ...enhancedExchange.assistant, text: t('chat.recordComplete') }
        : enhancedExchange.assistant;
    return (
      <View style={[styles.enhancedContainer, { minHeight: enhancedContainerMinHeight }]}
        key={enhancedExchange.user.id}
      >
        <ChatBubble message={enhancedExchange.user} />
        {assistantBubbleMessage ? (
          <>
            <ChatBubble message={assistantBubbleMessage} />
            {assistantCard && assistantCardId ? (
              <NutritionCard
                payload={assistantCard}
                onShare={() => handleShareCard(assistantCard, assistantCardId)}
                sharing={sharingId === assistantCardId}
                onAddFavorite={
                  assistantCard.favoriteCandidate
                    ? (draft) => handleAddFavoriteFromCard(assistantCardId, draft)
                    : undefined
                }
                addingFavorite={addingFavoriteId === assistantCardId}
                onEdit={assistantCard.logId ? () => handleEditLog(assistantCard.logId) : undefined}
              />
            ) : null}
          </>
        ) : null}
      </View>
    );
  };

  const planLabel = userPlan === 'PREMIUM' ? t('usage.plan.standard') : t('usage.plan.free');
  const headerSubtitle = planLabel;

  return (
    <AuroraBackground style={styles.container}>
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.headerWrap}>
            <BrandHeader
              title={t('chat.header')}
              subtitle={headerSubtitle}
              actionLabel={userPlan === 'FREE' ? t('usage.limitModal.purchase') : undefined}
              onAction={userPlan === 'FREE' ? handleOpenPaywall : undefined}
            />
            {usage ? (
              <View style={styles.statusPillRow}>
                <View style={styles.statusPill}>
                  <Text style={styles.statusLabel}>{t('usage.banner.remaining', { remaining: usage.remaining, limit: usage.limit })}</Text>
                </View>
                {usage.credits > 0 ? (
                  <View style={styles.statusPill}>
                    <Text style={styles.statusLabel}>{t('usage.banner.credits', { credits: usage.credits })}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
          {error ? <ErrorBanner message={error} /> : null}
        <FlatList
          style={styles.flex}
          ref={listRef}
          data={filteredTimeline}
          keyExtractor={(item) => item.id}
          contentInsetAdjustmentBehavior="never"
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
          contentContainerStyle={[styles.listContent, { paddingBottom: Math.max(bottomSectionHeight, 120) }]}
          ListFooterComponent={renderEnhancedFooter}
          onContentSizeChange={scrollToEnd}
          showsVerticalScrollIndicator={false}
        />
        <View
          style={styles.bottomSection}
          onLayout={(event) => setBottomSectionHeight(event.nativeEvent.layout.height)}
        >
          {composingImageUri ? (
            <View style={[styles.previewContainer, keyboardVisible && styles.previewHidden]}>
              <Image source={{ uri: composingImageUri }} style={styles.preview} />
              <TouchableOpacity onPress={() => setComposingImage(null)} style={styles.removeImage}>
                <Text style={{ color: '#fff' }}>✕</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          {!canSend ? (
            <View style={styles.limitBanner}>
              <Text style={styles.limitHint} numberOfLines={2} ellipsizeMode="tail">
                {t('usage.limitHint')}
              </Text>
            </View>
          ) : null}
          <View style={styles.quickActionsRow}>
            {quickActions.map((action) => (
              <TouchableOpacity key={action.key} style={styles.quickAction} onPress={action.onPress}>
                <Feather name={action.icon} size={14} color={colors.textPrimary} />
                <Text style={styles.quickActionLabel}>{action.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View
            style={[styles.composerArea, styles.composerDocked, { paddingBottom: Math.max(12, inset.bottom) }]}
          >
            <View style={styles.inputRow}>
              <TouchableOpacity onPress={handlePlusPress} style={styles.attachButton}>
                <Text style={styles.attachIcon}>＋</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setFavoritesVisible(true)} style={styles.favoriteButton}>
                <Text style={styles.favoriteIcon}>★</Text>
              </TouchableOpacity>
              <TextInput
                style={styles.textInput}
                placeholder={t('chat.placeholder')}
                value={input}
                onChangeText={setInput}
                multiline={false}
                numberOfLines={1}
                blurOnSubmit={false}
                returnKeyType={canSend ? 'send' : 'done'}
                enablesReturnKeyAutomatically
                onSubmitEditing={() => {
                  if (!sendButtonDisabled) {
                    void handleSend();
                  }
                }}
              />
              <TouchableOpacity
                onPress={() => {
                  if (!sendButtonDisabled) {
                    void handleSend();
                  }
                }}
                disabled={sendButtonDisabled}
                style={[styles.sendButton, sendButtonDisabled && styles.sendButtonDisabled]}
              >
                {sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.sendLabel}>{sendLabel}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
      <Modal
        visible={favoritesVisible}
        animationType="slide"
        onRequestClose={() => setFavoritesVisible(false)}
      >
        <SafeAreaView
          style={[
            styles.favoritesModalContainer,
            { paddingTop: inset.top + 12, paddingBottom: Math.max(inset.bottom, 16) },
          ]}
          edges={['left', 'right']}
        >
          <View style={styles.favoritesHeader}>
            <TouchableOpacity
              onPress={() => setFavoritesVisible(false)}
              style={styles.favoritesBackButton}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="戻る"
            >
              <Feather name="chevron-left" size={20} color={colors.textPrimary} />
              <Text style={styles.favoritesBackLabel}>戻る</Text>
            </TouchableOpacity>
            <Text style={styles.favoritesTitle} numberOfLines={1}>
              {t('recentLogs.heading')}
            </Text>
            <View style={styles.favoritesHeaderSpacer} />
          </View>
          {favoritesQuery.isLoading ? (
            <View style={styles.favoritesLoading}>
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : favoritesList.length ? (
            <ScrollView
              contentContainerStyle={[
                styles.favoritesList,
                { paddingBottom: Math.max(inset.bottom, 16) + 24 },
              ]}
              showsVerticalScrollIndicator={false}
            >
              {favoritesList.map((favorite) => (
                <TouchableOpacity
                  key={favorite.id}
                  style={styles.favoritesItem}
                  onPress={() => handleFavoriteSelect(favorite)}
                >
                  <Text style={styles.favoritesItemName}>{favorite.name}</Text>
                  <Text style={styles.favoritesItemMeta}>
                    {Math.round(favorite.totals.kcal)} kcal ／ P {formatMacro(favorite.totals.protein_g)}g ／ F {formatMacro(favorite.totals.fat_g)}g ／
                    C {formatMacro(favorite.totals.carbs_g)}g
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
                style={styles.usageModalPrimary}
                onPress={() => {
                  setLimitModalVisible(false);
                  handleOpenPaywall();
                }}
              >
                <Text style={styles.usageModalPrimaryLabel}>{t('usage.limitModal.purchase')}</Text>
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
                  handleOpenPaywall();
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
    </AuroraBackground>
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
  },
  headerWrap: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 4,
  },
  statusPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  statusLabel: {
    ...textStyles.caption,
    fontWeight: '600',
    color: colors.textPrimary,
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
  flex: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  bottomSection: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 12,
    backgroundColor: colors.surfaceMuted,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -2 },
    elevation: 6,
  },
  quickActionsRow: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 12,
  },
  quickAction: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  quickActionLabel: {
    ...textStyles.caption,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  enhancedContainer: {
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
    gap: 12,
  },
  composerArea: {
    borderRadius: 20,
    paddingTop: 12,
    paddingHorizontal: 16,
    gap: 8,
  },
  composerDocked: {
    backgroundColor: 'rgba(247,247,250,0.95)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  attachButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
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
    width: 44,
    height: 44,
    borderRadius: 14,
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
    height: 50,
    borderRadius: 14,
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    fontSize: 16,
    textAlignVertical: 'center',
  },
  sendButton: {
    height: 48,
    borderRadius: 14,
    paddingHorizontal: 20,
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
  previewHidden: {
    height: 0,
    opacity: 0,
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
  limitBanner: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  limitHint: {
    ...textStyles.caption,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  favoritesModalContainer: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 16,
  },
  favoritesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 16,
    gap: 12,
  },
  favoritesTitle: {
    ...textStyles.titleMedium,
    flex: 1,
    textAlign: 'center',
  },
  favoritesHeaderSpacer: {
    width: 52,
  },
  favoritesBackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    minWidth: 52,
    height: 44,
    borderRadius: 22,
    paddingHorizontal: 12,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: 4,
  },
  favoritesBackLabel: {
    ...textStyles.body,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  favoritesLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  favoritesList: {
    paddingHorizontal: 0,
    paddingTop: 8,
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
