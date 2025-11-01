import { Stack } from 'expo-router';

export default function OnboardingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="welcome" />
      <Stack.Screen name="goals" />
      <Stack.Screen name="basic-info" />
      <Stack.Screen name="marketing" />
      <Stack.Screen name="current-weight" />
      <Stack.Screen name="activity" />
      <Stack.Screen name="plan-mode" />
      <Stack.Screen name="plan-summary" />
      <Stack.Screen name="analysis" />
    </Stack>
  );
}
