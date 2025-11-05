import { Tabs, Redirect } from 'expo-router';
import React from 'react';
import { BlurView } from 'expo-blur';
import { StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSessionStore } from '@/store/session';
import { colors } from '@/theme/colors';
import { useTranslation } from '@/i18n';

const TabBarBackground = () => <BlurView tint="light" intensity={30} style={StyleSheet.absoluteFill} />;

export default function TabsLayout() {
  const user = useSessionStore((state) => state.user);
  const hydrated = useSessionStore((state) => state.hydrated);
  useTranslation();

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
        tabBarActiveTintColor: colors.textPrimary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarBackground: () => <TabBarBackground />,
        tabBarLabelStyle: { display: 'none' },
        tabBarItemStyle: { paddingVertical: 8 },
      }}
    >
      <Tabs.Screen
        name="chat"
        options={{
          tabBarLabel: '',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="message-circle" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="dashboard"
        options={{
          tabBarLabel: '',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="bar-chart-2" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          tabBarLabel: '',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="settings" color={color} focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}

function TabIcon({ name, focused }: { name: React.ComponentProps<typeof Feather>['name']; focused: boolean }) {
  const backgroundColor = focused ? colors.textPrimary : 'rgba(255,255,255,0.9)';
  const iconColor = focused ? '#fff' : colors.textPrimary;

  return (
    <View
      style={[
        styles.iconContainer,
        {
          backgroundColor,
          borderWidth: focused ? 0 : StyleSheet.hairlineWidth,
          borderColor: focused ? 'transparent' : 'rgba(28,28,30,0.08)',
          shadowOpacity: focused ? 0.12 : 0,
        },
      ]}
    >
      <Feather name={name} size={18} color={iconColor} />
    </View>
  );
}

const styles = StyleSheet.create({
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
  },
});
