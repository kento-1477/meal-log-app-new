import React, { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/theme/colors';
import { textStyles } from '@/theme/typography';
import { ChatBubble } from '@/components/ChatBubble';
import { NutritionCard } from '@/components/NutritionCard';
import { ErrorBanner } from '@/components/ErrorBanner';
import { useChatStore } from '@/store/chat';
import { postMealLog } from '@/services/api';
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

export default function ChatScreen() {
  const inset = useSafeAreaInsets();
  const listRef = useRef<FlatList<TimelineItemMessage | TimelineItemCard>>(null);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

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
        dish: response.dish,
        confidence: response.confidence,
        totals: response.totals,
        items: response.items,
        warnings: response.breakdown.warnings,
      });
      setMessageText(assistantPlaceholder.id, summaryText);
      setInput('');
      setComposingImage(null);
    } catch (err) {
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

  return (
    <View style={[styles.container, { paddingTop: inset.top + 12 }]}>
      <Text style={styles.headerTitle}>今日の食事</Text>
      {error ? <ErrorBanner message={error} /> : null}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <FlatList
          ref={listRef}
          data={timeline}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) =>
            item.type === 'message' ? (
              <ChatBubble message={item.payload} />
            ) : (
              <NutritionCard payload={item.payload} />
            )
          }
          contentContainerStyle={styles.listContent}
          onContentSizeChange={scrollToEnd}
          showsVerticalScrollIndicator={false}
        />
        <View style={[styles.composer, { paddingBottom: inset.bottom + 16 }]}>
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
    </View>
  );
}

function buildAssistantSummary(response: Awaited<ReturnType<typeof postMealLog>>) {
  const protein = Math.round(response.totals.protein_g);
  const fat = Math.round(response.totals.fat_g);
  const carbs = Math.round(response.totals.carbs_g);
  return `P${protein}g / F${fat}g / C${carbs}g を推定しました。信頼度は ${Math.round(
    response.confidence * 100,
  )}% です。`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 20,
  },
  headerTitle: {
    ...textStyles.titleLarge,
    marginBottom: 16,
  },
  flex: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 120,
  },
  composer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingTop: 12,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    shadowColor: colors.shadow,
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  attachButton: {
    backgroundColor: `${colors.accent}22`,
    borderRadius: 16,
    padding: 8,
    marginRight: 8,
  },
  attachIcon: {
    fontSize: 18,
    color: colors.accent,
  },
  textInput: {
    flex: 1,
    maxHeight: 120,
    fontSize: 16,
    paddingVertical: 8,
  },
  sendButton: {
    backgroundColor: colors.accent,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginLeft: 8,
  },
  sendLabel: {
    color: '#fff',
    fontWeight: '600',
  },
  previewContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  preview: {
    width: 72,
    height: 72,
    borderRadius: 16,
    marginRight: 12,
  },
  removeImage: {
    backgroundColor: colors.error,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
