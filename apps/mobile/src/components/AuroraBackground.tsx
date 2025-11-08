import React from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View, type ViewProps } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { colors } from '@/theme/colors';

export const AuroraBackground: React.FC<ViewProps> = ({ children, style, ...rest }) => {
  return (
    <View style={[styles.container, style]} {...rest}>
      <LinearGradient
        colors={['#F9FBFF', '#F1F4FA']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <RadialGradient id="aurora-1" cx="20%" cy="5%" rx="40%" ry="40%">
            <Stop offset="0%" stopColor="#FFE3FA" stopOpacity={0.9} />
            <Stop offset="100%" stopColor="#FFE3FA" stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="aurora-2" cx="80%" cy="15%" rx="35%" ry="35%">
            <Stop offset="0%" stopColor="#D1EEFF" stopOpacity={0.8} />
            <Stop offset="100%" stopColor="#D1EEFF" stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="aurora-3" cx="70%" cy="85%" rx="65%" ry="60%">
            <Stop offset="0%" stopColor="#F9FFD5" stopOpacity={0.55} />
            <Stop offset="100%" stopColor="#F9FFD5" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#aurora-1)" />
        <Rect width="100%" height="100%" fill="url(#aurora-2)" />
        <Rect width="100%" height="100%" fill="url(#aurora-3)" />
      </Svg>
      <View style={styles.content}>{children}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.sheetBackdrop,
  },
  content: {
    flex: 1,
  },
});
