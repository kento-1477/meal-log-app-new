import React from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '@/theme/colors';
import { textStyles } from '@/theme/typography';
import type { ChatMessage } from '@/types/chat';

interface ChatBubbleProps {
  message: ChatMessage;
}

export const ChatBubble: React.FC<ChatBubbleProps> = ({ message }) => {
  const isUser = message.role === 'user';
  const content = (message.text ?? '').trim();
  if (!content.length) {
    return null;
  }
  const textStyle = [styles.text, isUser ? styles.userText : styles.assistantText];

  return (
    <View style={[styles.row, isUser ? styles.rowRight : styles.rowLeft]}>
      {isUser ? (
        <LinearGradient
          colors={[colors.accent, '#FFD36A']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.bubble, styles.userBubble]}
        >
          <Text style={textStyle}>{message.text}</Text>
          {message.status === 'error' && <Text style={styles.error}>⚠️ 再度お試しください。</Text>}
        </LinearGradient>
      ) : (
        <View style={[styles.bubble, styles.assistantBubble]}>
          <Text style={textStyle}>{message.text}</Text>
          {message.status === 'error' && <Text style={styles.error}>⚠️ 再度お試しください。</Text>}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  rowRight: {
    justifyContent: 'flex-end',
  },
  rowLeft: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '82%',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
    shadowColor: colors.shadow,
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  userBubble: {
    borderBottomRightRadius: 6,
  },
  assistantBubble: {
    backgroundColor: colors.surfaceStrong,
    borderBottomLeftRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    shadowOpacity: 0.08,
  },
  text: {
    ...textStyles.body,
  },
  userText: {
    color: '#fff',
  },
  assistantText: {
    color: colors.textPrimary,
  },
  error: {
    marginTop: 8,
    ...textStyles.caption,
    color: colors.error,
  },
});
