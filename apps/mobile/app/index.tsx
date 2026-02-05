import { Redirect } from 'expo-router';
import { AppSplash } from '@/components/AppSplash';
import { useSessionStore } from '@/store/session';

export default function Index() {
  const user = useSessionStore((state) => state.user);
  const hydrated = useSessionStore((state) => state.hydrated);
  const sessionChecked = useSessionStore((state) => state.sessionChecked);
  const onboarding = useSessionStore((state) => state.onboarding);

  if (!hydrated) {
    return <AppSplash />;
  }

  if (!user && !sessionChecked) {
    return <AppSplash />;
  }

  if (user) {
    const completed = onboarding?.completed ?? false;
    if (!completed) {
      return <Redirect href="/(onboarding)/welcome" />;
    }
    return <Redirect href="/(tabs)/chat" />;
  }

  return <Redirect href="/login" />;
}
