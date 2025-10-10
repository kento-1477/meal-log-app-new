import { Redirect } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { useSessionStore } from '@/store/session';
import { colors } from '@/theme/colors';

export default function Index() {
  const user = useSessionStore((state) => state.user);
  const hydrated = useSessionStore((state) => state.hydrated);
  const status = useSessionStore((state) => state.status);

  if (!hydrated || status === 'loading') {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (user) {
    return <Redirect href="/(tabs)/chat" />;
  }

  return <Redirect href="/login" />;
}
