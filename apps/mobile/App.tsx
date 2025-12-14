// Expo Router entry shim for environments that expect a traditional App entrypoint.
// This file must export a React component because Expo's AppEntry calls registerRootComponent(App).
import '@expo/metro-runtime';
import { App } from 'expo-router/build/qualified-entry';

export default App;
