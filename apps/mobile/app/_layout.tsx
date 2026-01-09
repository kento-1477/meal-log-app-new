import { Stack } from 'expo-router';
import { useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useSessionBootstrap } from '@/hooks/useSessionBootstrap';
import { useLocaleBootstrap } from '@/hooks/useLocaleBootstrap';
import { useReferralDeepLink } from '@/hooks/useReferralDeepLink';
import { useNotificationBootstrap } from '@/hooks/useNotificationBootstrap';
import { useIapSync } from '@/hooks/useIapSync';
import { useTranslation } from '@/i18n';
import { colors } from '@/theme/colors';

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient());
  useSessionBootstrap();
  useLocaleBootstrap();
  useReferralDeepLink();
  useNotificationBootstrap();
  useIapSync();
  const { t } = useTranslation();

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="dark" />
          <Stack screenOptions={{ headerShown: false, headerBackTitleVisible: false }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="(onboarding)" />
            <Stack.Screen name="invite" options={{ presentation: 'transparentModal', headerShown: false }} />
            <Stack.Screen name="login" options={{ presentation: 'modal' }} />
            <Stack.Screen
              name="log/[id]"
              options={{ headerShown: true, title: '食事ログの編集', headerBackTitleVisible: false, headerBackTitle: '' }}
            />
            <Stack.Screen
              name="settings/account"
              options={{ headerShown: true, title: 'アカウント管理', headerBackTitleVisible: false, headerBackTitle: '' }}
            />
            <Stack.Screen
              name="settings/nutrition"
              options={{ headerShown: true, title: '栄養目標', headerBackTitleVisible: false, headerBackTitle: '' }}
            />
            <Stack.Screen
              name="settings/profile"
              options={{ headerShown: true, title: '目標と現在の体重', headerBackTitleVisible: false, headerBackTitle: '' }}
            />
            <Stack.Screen
              name="settings/notifications"
              options={{ headerShown: true, title: '通知設定', headerBackTitleVisible: false, headerBackTitle: '' }}
            />
            <Stack.Screen
              name="settings/language"
              options={{ headerShown: true, title: '表示言語', headerBackTitleVisible: false, headerBackTitle: '' }}
            />
            <Stack.Screen
              name="paywall"
              options={{
                headerShown: true,
                title: t('paywall.headerTitle'),
                presentation: 'modal',
                headerBackTitleVisible: false,
                headerBackTitle: '',
              }}
            />
          </Stack>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
