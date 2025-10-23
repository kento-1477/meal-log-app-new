import { Stack } from 'expo-router';
import { useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useSessionBootstrap } from '@/hooks/useSessionBootstrap';
import { useLocaleBootstrap } from '@/hooks/useLocaleBootstrap';
import { useReferralDeepLink } from '@/hooks/useReferralDeepLink';
import { colors } from '@/theme/colors';

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient());
  useSessionBootstrap();
  useLocaleBootstrap();
  useReferralDeepLink();

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="dark" />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="login" options={{ presentation: 'modal' }} />
            <Stack.Screen name="register" options={{ headerShown: true, title: '新規登録', presentation: 'modal' }} />
            <Stack.Screen name="log/[id]" options={{ headerShown: true, title: '食事ログの編集' }} />
            <Stack.Screen name="settings/account" options={{ headerShown: true, title: 'アカウント管理' }} />
            <Stack.Screen name="settings/profile" options={{ headerShown: true, title: 'プロフィールと目標' }} />
            <Stack.Screen name="settings/notifications" options={{ headerShown: true, title: '通知設定' }} />
            <Stack.Screen name="settings/language" options={{ headerShown: true, title: '表示言語' }} />
          </Stack>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
