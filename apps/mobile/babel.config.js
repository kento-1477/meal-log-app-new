const path = require('path');
const { expoRouterBabelPlugin } = require('babel-preset-expo/build/expo-router-plugin');

module.exports = (api) => {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      expoRouterBabelPlugin,
      [
        'module-resolver',
        {
          alias: {
            '@': path.join(__dirname, 'src'),
          },
          extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
        },
      ],
      'react-native-worklets/plugin',
    ],
  };
};
