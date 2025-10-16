import React, { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
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
import { useQueryClient } from '@tanstack/react-query';
import { colors } from '@/theme/colors';
import { textStyles } from '@/theme/typography';
import { ChatBubble } from '@/components/ChatBubble';
import { NutritionCard } from '@/components/NutritionCard';
import { ErrorBanner } from '@/components/ErrorBanner';
import { useChatStore } from '@/store/chat';
import { getMealLogShare, postMealLog, type MealLogResponse } from '@/services/api';
import type { NutritionCardPayload } from '@/types/chat';

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
  const listRef = useRef<FlatList<TimelineItemMessage | TimelineItemCard>>(null);
  const tabBarHeight = useBottomTabBarHeight();
  const queryClient = useQueryClient();
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sharingId, setSharingId] = useState<string | null>(null);

  const { messages, addUserMessage, addAssistantMessage, setMessageText, updateMessageStatus, attachCardToMessage, composingImageUri, setComposingImage } = useChatStore();

  const timeline = useMemo<Array<TimelineItemMessage | TimelineItemCard>>(() => composeTimeline(messages), [messages]);

  const scrollToEnd = () => {
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  };

  const handleSend = async () => {
    if (!input.trim() && !composingImageUri) {
      return;
    }
    setSending(true);
    setError(null);

    const userMessage = addUserMessage(input.trim() || '（画像解析）');
    const assistantPlaceholder = addAssistantMessage('解析中です…', { status: 'sending' });
    scrollToEnd();

    try {
      const response = await postMealLog({ message: input.trim(), imageUri: composingImageUri ?? undefined });
      updateMessageStatus(userMessage.id, 'delivered');

      const summaryText = buildAssistantSummary(response);
      updateMessageStatus(assistantPlaceholder.id, 'delivered');
      attachCardToMessage(assistantPlaceholder.id, {
        logId: response.logId,
        dish: response.dish,
        confidence: response.confidence,
        totals: response.totals,
        items: response.items,
        warnings: response.breakdown.warnings,
      });
      setMessageText(assistantPlaceholder.id, summaryText);
      setInput('');
      setComposingImage(null);
      queryClient.invalidateQueries({ queryKey: ['recentLogs'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardSummary'] });
      queryClient.invalidateQueries({ queryKey: ['streak'] });
    } catch (_error) {
      updateMessageStatus(userMessage.id, 'error');
      updateMessageStatus(assistantPlaceholder.id, 'error');
      setError('エラーが発生しました。もう一度お試しください。');
    } finally {
      setSending(false);
      scrollToEnd();
    }
  };

  const handleAttach = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('写真ライブラリへのアクセスを許可してください。');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images });
    if (!result.canceled && result.assets?.length) {
      setComposingImage(result.assets[0].uri);
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

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <Text style={styles.headerTitle}>今日の食事</Text>
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
            <TextInput
              style={styles.textInput}
              placeholder="食事内容を入力..."
              value={input}
              onChangeText={setInput}
              multiline
            />
            <TouchableOpacity onPress={handleSend} disabled={sending} style={styles.sendButton}>
              {sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.sendLabel}>送信</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
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
    marginBottom: 16,
    paddingHorizontal: 16,
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
  },
  // ... (rest of the styles)
});
