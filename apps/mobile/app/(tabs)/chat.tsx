import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

// ... (rest of the imports)

// ... (Timeline interfaces)

// ... (composeTimeline function)

export default function ChatScreen() {
  const inset = useSafeAreaInsets();
  const listRef = useRef<FlatList<TimelineItemMessage | TimelineItemCard>>(null);
  const tabBarHeight = useBottomTabBarHeight();
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
              <NutritionCard payload={item.payload} />
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

// ... (buildAssistantSummary function)

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
