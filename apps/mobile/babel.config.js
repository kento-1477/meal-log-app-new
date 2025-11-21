module.exports = (api) => {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      './babel-inline-router-env.js',
      'react-native-worklets/plugin',
    ],
  };
};
