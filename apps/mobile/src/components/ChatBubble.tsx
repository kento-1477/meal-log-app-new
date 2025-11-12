import React, { useEffect, useRef } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Animated, Easing, Image, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/theme/colors';
import { textStyles } from '@/theme/typography';
import type { ChatMessage } from '@/types/chat';

const AI_AVATAR = require('../assets/ai-avatar.png');

interface ChatBubbleProps {
  message: ChatMessage;
}

export const ChatBubble: React.FC<ChatBubbleProps> = ({ message }) => {
  const isUser = message.role === 'user';
  const isProcessing = !isUser && message.status === 'processing';
  const content = (message.text ?? '').trim();
  if (!content.length && !isProcessing) {
    return null;
  }
  const textStyle = [styles.text, isUser ? styles.userText : styles.assistantText];
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!isProcessing) {
      return;
    }
    const loop = Animated.loop(
      Animated.timing(shimmer, {
        toValue: 1,
        duration: 1400,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [isProcessing, shimmer]);

  const translateX = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [-40, 120],
  });

  return (
    <View style={[styles.row, isUser ? styles.rowRight : styles.rowLeft]}>
      {isUser ? null : (
        <View style={styles.avatarWrapper}>
          <Image source={AI_AVATAR} style={styles.avatar} resizeMode="contain" />
        </View>
      )}
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
        <View style={[styles.bubble, styles.assistantBubble, isProcessing && styles.processingBubble]}>
          {isProcessing ? (
            <View style={styles.processingBody}>
              <View style={styles.processingLabelRow}>
                <View style={styles.processingSpark} />
                <Text style={styles.processingLabel}>{message.text}</Text>
              </View>
              <View style={styles.processingTrack}>
                <Animated.View style={[styles.processingGlow, { transform: [{ translateX }] }]} />
              </View>
            </View>
          ) : (
            <>
              <Text style={textStyle}>{message.text}</Text>
              {message.status === 'error' && <Text style={styles.error}>⚠️ 再度お試しください。</Text>}
            </>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    marginBottom: 12,
    alignItems: 'flex-end',
  },
  rowRight: {
    justifyContent: 'flex-end',
  },
  rowLeft: {
    justifyContent: 'flex-start',
  },
  avatarWrapper: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  avatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
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
  processingBubble: {
    borderColor: 'rgba(17,19,24,0.08)',
    backgroundColor: 'rgba(255,255,255,0.92)',
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
  processingBody: {
    gap: 10,
  },
  processingLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  processingSpark: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.accent,
    shadowColor: colors.accent,
    shadowOpacity: 0.7,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  processingLabel: {
    ...textStyles.caption,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  processingTrack: {
    position: 'relative',
    height: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(17,19,24,0.08)',
    overflow: 'hidden',
  },
  processingGlow: {
    position: 'absolute',
    left: 0,
    width: 90,
    height: '100%',
    borderRadius: 999,
    backgroundColor: colors.accent,
    opacity: 0.5,
  },
});
