import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  AppState,
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
import { nanoid } from 'nanoid/non-secure';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
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
import { PrimaryButton } from '@/components/PrimaryButton';
import { useChatStore } from '@/store/chat';
import { useSessionStore } from '@/store/session';
import {
  createFavoriteMeal,
  createLogFromFavorite,
  getFavorites,
  getMealLogShare,
  getIngestStatus,
  getStreak,
  getSession,
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
const PENDING_INGEST_STALE_MS = 1000 * 60 * 10;
const NETWORK_ERROR_PATTERNS = [
  'Network request failed',
  'The network connection was lost',
  'A server with the specified hostname could not be found',
  'offline',
  'timed out',
  'timeout',
  'タイムアウト',
];

function isLikelyNetworkError(error: unknown): boolean {
  if (!error) {
    return false;
  }
  const code = typeof (error as { code?: unknown }).code === 'string' ? (error as { code: string }).code : '';
  if (code.startsWith('network.')) {
    return true;
  }
  const name = typeof (error as { name?: unknown }).name === 'string' ? (error as { name: string }).name : '';
  if (name === 'AbortError') {
    return true;
  }
  if (error instanceof TypeError) {
    return true;
  }
  const message = typeof (error as { message?: unknown }).message === 'string' ? (error as { message: string }).message : '';
  return NETWORK_ERROR_PATTERNS.some((pattern) => message.toLowerCase().includes(pattern.toLowerCase()));
}

// ... (rest of the imports)

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
  const [bottomSectionHeight, setBottomSectionHeight] = useState(0);
  const networkHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const usageRefreshInFlight = useRef(false);
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

  const renderMealLogResult = useCallback(
    (response: MealLogResponse, placeholderId: string) => {
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
    },
    [attachCardToMessage, setMessageText],
  );

  const [mediaPermission, requestMediaPermission] = ImagePicker.useMediaLibraryPermissions();
  const [cameraPermission, requestCameraPermission] = ImagePicker.useCameraPermissions();

  const prevMessagesRef = useRef<ChatMessage[] | null>(null);
  const [enhancedExchange, setEnhancedExchange] = useState<{ user: ChatMessage; assistant: ChatMessage | null } | null>(null);

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }, []);

  const pendingIngests = useMemo(() => {
    const derived = messages
      .filter(
        (message) =>
          message.role === 'assistant' &&
          message.status === 'processing' &&
          typeof message.ingest?.requestKey === 'string' &&
          typeof message.ingest?.userMessageId === 'string',
      )
      .map((message) => ({
        requestKey: message.ingest!.requestKey,
        userMessageId: message.ingest!.userMessageId,
        assistantMessageId: message.id,
        createdAt: message.createdAt,
      }));

    // De-dup by requestKey (keep the most recent).
    const byKey = new Map<string, (typeof derived)[number]>();
    for (const entry of derived) {
      byKey.set(entry.requestKey, entry);
    }
    return [...byKey.values()].sort((a, b) => a.createdAt - b.createdAt);
  }, [messages]);

  const ingestRefreshInFlight = useRef(false);
  const refreshPendingIngests = useCallback(async () => {
    if (ingestRefreshInFlight.current) {
      return;
    }
    if (!pendingIngests.length) {
      return;
    }
    if (__DEV__) {
      console.log('[chat] refreshPendingIngests', {
        count: pendingIngests.length,
        keys: pendingIngests.map((entry) => entry.requestKey).slice(0, 5),
      });
    }
    ingestRefreshInFlight.current = true;
    try {
      for (const ingest of pendingIngests) {
        try {
          const status = await getIngestStatus(ingest.requestKey);
          if (__DEV__) {
            console.log('[chat] ingest status', { requestKey: ingest.requestKey, status: status.status });
          }
          if (status.ok && status.status === 'done') {
            updateMessageStatus(ingest.userMessageId, 'delivered');
            updateMessageStatus(ingest.assistantMessageId, 'delivered');
            renderMealLogResult(status.result, ingest.assistantMessageId);
            if (status.result.usage) {
              setUsage(status.result.usage);
            }
            setError(null);
            queryClient.invalidateQueries({ queryKey: ['recentLogs'] });
            queryClient.invalidateQueries({ queryKey: ['mealLogs'] });
            queryClient.invalidateQueries({ queryKey: ['dashboardSummary'] });
            queryClient.invalidateQueries({ queryKey: ['streak'] });
            scrollToEnd();
          } else if (status.ok && status.status === 'processing') {
            const tooOld = Date.now() - ingest.createdAt > PENDING_INGEST_STALE_MS;
            if (tooOld) {
              updateMessageStatus(ingest.userMessageId, 'error');
              updateMessageStatus(ingest.assistantMessageId, 'error');
              setMessageText(ingest.assistantMessageId, t('chat.genericErrorBubble'));
              removePendingIngest(ingest.requestKey);
            }
          }
        } catch (error) {
          if (__DEV__) {
            console.warn('[chat] ingest status fetch failed', { requestKey: ingest.requestKey, error });
          }
          const apiError = error as ApiError;
          const tooOld = Date.now() - ingest.createdAt > 1000 * 60 * 2;
          if (apiError.status === 404 && tooOld) {
            updateMessageStatus(ingest.userMessageId, 'error');
            updateMessageStatus(ingest.assistantMessageId, 'error');
            setMessageText(ingest.assistantMessageId, t('chat.networkErrorBubble'));
          }
        }
      }
    } finally {
      ingestRefreshInFlight.current = false;
    }
  }, [
    pendingIngests,
    queryClient,
    renderMealLogResult,
    scrollToEnd,
    setMessageText,
    setUsage,
    setError,
    t,
    updateMessageStatus,
  ]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void refreshPendingIngests();
      }
    });
    return () => sub.remove();
  }, [refreshPendingIngests]);

  useEffect(() => {
    void refreshPendingIngests();
    if (!pendingIngests.length) {
      return;
    }
    const poll = setInterval(() => void refreshPendingIngests(), 5000);
    return () => clearInterval(poll);
  }, [pendingIngests.length, refreshPendingIngests]);


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

  const usageResetHasPassed = useMemo(() => {
    if (!usage?.resetsAt) return false;
    const resetMs = Date.parse(usage.resetsAt);
    return Number.isFinite(resetMs) && resetMs <= Date.now();
  }, [usage?.resetsAt]);

  useEffect(() => {
    if (!hasUsage || usagePlan !== 'FREE' || (usageRemaining ?? 0) > 0) {
      return;
    }
    if (usageResetHasPassed) {
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
  }, [hasUsage, usagePlan, usageRemaining, usageResetHasPassed]);

  useEffect(() => {
    if (!usage) return;
    if (usage.remaining > 0 || usage.credits > 0) return;
    if (!usageResetHasPassed) return;
    if (usageRefreshInFlight.current) return;

    let cancelled = false;
    usageRefreshInFlight.current = true;

    (async () => {
      try {
        const session = await getSession();
        if (cancelled) return;
        if (session.authenticated && session.user) {
          setUser(session.user);
          setUsage(session.usage ?? null);
          setStatus('authenticated');
        } else {
          setUser(null);
          setUsage(null);
          setStatus('unauthenticated');
        }
      } catch (error) {
        console.warn('Failed to refresh usage after reset', error);
      } finally {
        if (!cancelled) {
          usageRefreshInFlight.current = false;
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [setStatus, setUsage, setUser, usage, usageResetHasPassed]);

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

  const usageProgress = useMemo(() => {
    if (!usage || usage.limit <= 0 || usageResetHasPassed) {
      return 0;
    }
    const usedCount = Math.max(0, usage.limit - usage.remaining);
    const ratio = usedCount / usage.limit;
    return Math.max(0, Math.min(1, ratio));
  }, [usage, usageResetHasPassed]);

  const canSend = !usage || usage.remaining > 0 || usage.credits > 0 || usageResetHasPassed;
  const isLimitReached = Boolean(usage) && !canSend;
  const hasTypedInput = input.trim().length > 0;
  const hasAttachment = Boolean(composingImageUri);
  const canSubmitMessage = hasTypedInput || hasAttachment;
  const sendButtonDisabled = sending || !canSend || !canSubmitMessage;

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

    const displayMessage = trimmedMessage || (hasImage ? t('chat.sentPhoto') : rawMessage);

    const userMessage = addUserMessage(displayMessage);
    const processingText = t('chat.processing');
    const requestKey = options.request ? null : `ingest_${Date.now()}_${nanoid(10)}`;
    if (__DEV__) {
      console.log('[chat] submitMeal start', {
        requestKey,
        hasImage,
        messageLen: (trimmedMessage || rawMessage).length,
      });
    }
    const assistantPlaceholder = addAssistantMessage(processingText, {
      status: 'processing',
      ingest: requestKey ? { requestKey, userMessageId: userMessage.id } : undefined,
    });
    const hintDelay = hasImage ? NETWORK_HINT_DELAY_IMAGE_MS : NETWORK_HINT_DELAY_TEXT_MS;
    networkHintTimerRef.current = setTimeout(() => {
      setMessageText(assistantPlaceholder.id, `${processingText}\n${t('chat.networkSlowWarning')}`);
    }, hintDelay);
    scrollToEnd();

    try {
      const requestFn =
        options.request ??
        (() =>
          postMealLog({
            message: trimmedMessage || rawMessage,
            imageUri: options.imageUri ?? undefined,
            idempotencyKey: requestKey ?? undefined,
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
      if (__DEV__) {
        console.warn('[chat] submitMeal failed', { requestKey, apiError });
      }
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
        updateMessageStatus(userMessage.id, 'delivered');
        updateMessageStatus(assistantPlaceholder.id, 'processing');
        setMessageText(assistantPlaceholder.id, t('chat.processing'));
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
    const messageSnapshot = input;
    const imageSnapshot = composingImageUri ?? null;
    if (imageSnapshot) {
      resetComposer();
    }
    const response = await submitMeal(messageSnapshot, {
      imageUri: imageSnapshot,
      onSuccess: imageSnapshot ? undefined : resetComposer,
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

  const ensureCameraPermission = useCallback(async () => {
    const current = cameraPermission ?? (await ImagePicker.getCameraPermissionsAsync());
    if (current?.granted) {
      return current;
    }
    if (current?.canAskAgain) {
      const updated = await requestCameraPermission();
      return updated ?? current;
    }
    return current;
  }, [cameraPermission, requestCameraPermission]);

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

  const handleTakePhoto = useCallback(async () => {
    try {
      const permission = await ensureCameraPermission();
      if (!permission?.granted) {
        setError('カメラへのアクセスを許可してください。設定アプリから変更できます。');
        if (permission && !permission.canAskAgain) {
          Alert.alert('カメラにアクセスできません', '設定アプリで Meal Log のカメラアクセスを許可してください。');
        }
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.8,
        exif: false,
        cameraType: ImagePicker.CameraType.back,
      });

      if (!result.canceled) {
        const uri = result.assets?.[0]?.uri ?? null;
        if (uri) {
          setComposingImage(uri);
        }
      }
    } catch (error) {
      console.warn('Failed to open camera', error);
      setError('カメラの起動に失敗しました。もう一度お試しください。');
    }
  }, [ensureCameraPermission, setComposingImage, setError]);

  const handlePhotoQuickAction = useCallback(() => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [t('chat.actions.takePhoto'), t('chat.actions.attachPhoto'), t('common.cancel')],
          cancelButtonIndex: 2,
        },
        (buttonIndex) => {
          if (buttonIndex === 0) {
            void handleTakePhoto();
          }
          if (buttonIndex === 1) {
            void handleAttach();
          }
        },
      );
    } else {
      Alert.alert(t('chat.quickActions.photo'), undefined, [
        { text: t('chat.actions.takePhoto'), onPress: () => void handleTakePhoto() },
        { text: t('chat.actions.attachPhoto'), onPress: () => void handleAttach() },
        { text: t('common.cancel'), style: 'cancel' },
      ]);
    }
  }, [handleAttach, handleTakePhoto, t]);

  type QuickAction = {
    key: string;
    icon: React.ComponentProps<typeof Feather>['name'];
    label: string;
    onPress: () => void;
  };

  const quickActions = useMemo<QuickAction[]>(
    () => [
      { key: 'photo', icon: 'camera', label: t('chat.quickActions.photo'), onPress: handlePhotoQuickAction },
      { key: 'favorite', icon: 'star', label: t('chat.quickActions.favorite'), onPress: () => setFavoritesVisible(true) },
    ],
    [handlePhotoQuickAction, t],
  );

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
    const shouldShowUserBubble = !assistantHasCard;

    return (
      <View style={[styles.enhancedContainer, { minHeight: enhancedContainerMinHeight }]}
        key={enhancedExchange.user.id}
      >
        {shouldShowUserBubble ? <ChatBubble message={enhancedExchange.user} /> : null}
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

  return (
    <AuroraBackground style={styles.container}>
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.headerWrap}>
            <BrandHeader title={t('chat.header')} />
            {usage ? (
              <View style={styles.usageBlock}>
                <View
                  style={styles.usageProgressTrack}
                  accessibilityRole="progressbar"
                  accessibilityValue={{ now: Math.round(usageProgress * 100), min: 0, max: 100 }}
                >
                  <LinearGradient
                    colors={[colors.accent, colors.accentSage]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[styles.usageProgressFill, { width: `${usageProgress * 100}%` }]}
                  />
                </View>
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
                <ChatBubble
                  message={
                    item.payload.card && item.payload.role === 'assistant'
                      ? { ...item.payload, text: t('chat.recordComplete') }
                      : item.payload
                  }
                />
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
            {isLimitReached ? (
              <LinearGradient
                colors={[colors.accentSoft, colors.cardAuroraMid]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.limitCard, { paddingBottom: Math.max(18, inset.bottom + 4) }]}
              >
                <Text style={styles.limitCardTitle}>{t('chat.limitReached.title')}</Text>
                <Text style={styles.limitCardDescription} numberOfLines={2} ellipsizeMode="tail">
                  {t('usage.limitHint')}
                </Text>
                <PrimaryButton label={t('usage.limitModal.purchase')} onPress={handleOpenPaywall} />
              </LinearGradient>
            ) : (
              <>
                {composingImageUri ? (
                  <View style={styles.previewContainer}>
                    <Image source={{ uri: composingImageUri }} style={styles.preview} />
                    <TouchableOpacity onPress={() => setComposingImage(null)} style={styles.removeImage}>
                      <Text style={{ color: '#fff' }}>✕</Text>
                    </TouchableOpacity>
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
                    <TextInput
                      style={styles.textInput}
                      placeholder={t('chat.placeholder')}
                      value={input}
                      onChangeText={setInput}
                      multiline={false}
                      blurOnSubmit={false}
                      returnKeyType="send"
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
              </>
            )}
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
    gap: 10,
  },
  usageBlock: {
    paddingHorizontal: 24,
    paddingBottom: 10,
    gap: 10,
  },
  usageProgressTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  usageProgressFill: {
    height: '100%',
    borderRadius: 999,
  },
  statusPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
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
  textInputMultiline: {
    height: 80,
    minHeight: 50,
    maxHeight: 120,
    paddingVertical: 12,
    textAlignVertical: 'top',
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
  limitCard: {
    borderRadius: 20,
    padding: 18,
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    shadowColor: colors.shadow,
    shadowOpacity: 0.16,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  limitCardTitle: {
    ...textStyles.titleMedium,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  limitCardDescription: {
    ...textStyles.body,
    color: colors.textSecondary,
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
