const Constants = {
  appOwnership: 'standalone',
  implementationVersion: 'test',
  installationId: 'test-installation-id',
  deviceName: 'CI Simulator',
  platform: {
    ios: { buildNumber: '0', model: 'iPhone' },
    android: { versionCode: 0, model: 'Android' },
  },
  expoVersion: '0.0.0-test',
  nativeAppVersion: '0.0.0',
};

export default Constants;
export const appOwnership = Constants.appOwnership;
export const installationId = Constants.installationId;
export const expoVersion = Constants.expoVersion;
