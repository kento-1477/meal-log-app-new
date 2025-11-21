module.exports = (api) => {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      './babel-inline-expo-router.js',
      'react-native-worklets/plugin',
    ],
  };
};
