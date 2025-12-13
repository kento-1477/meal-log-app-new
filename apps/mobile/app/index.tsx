import { Redirect } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { useSessionStore } from '@/store/session';
import { colors } from '@/theme/colors';

export default function Index() {
  const user = useSessionStore((state) => state.user);
  const hydrated = useSessionStore((state) => state.hydrated);
  const status = useSessionStore((state) => state.status);
  const onboarding = useSessionStore((state) => state.onboarding);

  if (!hydrated || status === 'loading') {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (user) {
    const completed = onboarding?.completed ?? false;
    if (!completed) {
      return <Redirect href="/(onboarding)/welcome" />;
    }
    return <Redirect href="/(tabs)/chat" />;
  }

  return <Redirect href="/(onboarding)/welcome" />;
}
