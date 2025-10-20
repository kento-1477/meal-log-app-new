import { Stack } from 'expo-router';
import { useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useSessionBootstrap } from '@/hooks/useSessionBootstrap';
import { useLocaleBootstrap } from '@/hooks/useLocaleBootstrap';
import { colors } from '@/theme/colors';

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient());
  useSessionBootstrap();
  useLocaleBootstrap();

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="dark" />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="login" options={{ presentation: 'modal' }} />
            <Stack.Screen name="log/[id]" options={{ headerShown: true, title: '食事ログの編集' }} />
          </Stack>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
