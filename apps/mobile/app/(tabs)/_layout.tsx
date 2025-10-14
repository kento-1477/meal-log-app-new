import { Tabs, Redirect } from 'expo-router';
import React from 'react';
import { BlurView } from 'expo-blur';
import { StyleSheet, Text } from 'react-native';
import { useSessionStore } from '@/store/session';
import { colors } from '@/theme/colors';

const TabBarBackground = () => <BlurView tint="light" intensity={30} style={StyleSheet.absoluteFill} />;

export default function TabsLayout() {
  const user = useSessionStore((state) => state.user);
  const hydrated = useSessionStore((state) => state.hydrated);

  if (!hydrated) {
    return null;
  }

  if (!user) {
    return <Redirect href="/login" />;
  }

  return (
    <Tabs
      initialRouteName="chat"
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarBackground: () => <TabBarBackground />,
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="chat"
        options={{
          title: 'チャット',
          tabBarIcon: ({ color }) => <TabIcon label="💬" color={color} />,
        }}
      />
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'ダッシュボード',
          tabBarIcon: ({ color }) => <TabIcon label="📊" color={color} />,
        }}
      />
    </Tabs>
  );
}

function TabIcon({ label, color }: { label: string; color: string }) {
  return <Text style={[styles.icon, { color }]}>{label}</Text>;
}

const styles = StyleSheet.create({
  icon: {
    fontSize: 18,
  },
});
