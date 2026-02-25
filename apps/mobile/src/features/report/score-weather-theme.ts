export type ReportWeatherTheme = 'rain' | 'cloudy' | 'partlySunny' | 'sunny';

export type ReportScoreBand = 'lt50' | '50to64' | '65to79' | '80plus';

export type ReportWeatherPalette = {
  theme: ReportWeatherTheme;
  scoreBand: ReportScoreBand;
  icon: string;
  labelKey: `report.weather.${ReportWeatherTheme}`;
  decisionStateKey: `report.summaryV2.decisionState.${ReportWeatherTheme}`;
  heroStart: string;
  heroEnd: string;
  ringStart: string;
  ringEnd: string;
  ringTrack: string;
  badgeBg: string;
  badgeText: string;
  missionBg: string;
  missionBorder: string;
  kpiBg: string;
  shareBgStart: string;
  shareBgEnd: string;
  shareCardStart: string;
  shareCardEnd: string;
};

const WEATHER_THEME_BY_BAND: Record<ReportScoreBand, ReportWeatherPalette> = {
  lt50: {
    theme: 'rain',
    scoreBand: 'lt50',
    icon: '🌧️',
    labelKey: 'report.weather.rain',
    decisionStateKey: 'report.summaryV2.decisionState.rain',
    heroStart: '#DDE8F6',
    heroEnd: '#C8D8ED',
    ringStart: '#7F98BA',
    ringEnd: '#6786AE',
    ringTrack: 'rgba(59,84,118,0.24)',
    badgeBg: '#ECF3FD',
    badgeText: '#3F5C80',
    missionBg: '#F1F6FC',
    missionBorder: 'rgba(73,102,140,0.22)',
    kpiBg: '#EDF3FA',
    shareBgStart: '#DBE6F5',
    shareBgEnd: '#C5D7EC',
    shareCardStart: '#F5F8FC',
    shareCardEnd: '#E8EFF8',
  },
  '50to64': {
    theme: 'cloudy',
    scoreBand: '50to64',
    icon: '☁️',
    labelKey: 'report.weather.cloudy',
    decisionStateKey: 'report.summaryV2.decisionState.cloudy',
    heroStart: '#ECEFF6',
    heroEnd: '#DBE3F1',
    ringStart: '#9CA9BE',
    ringEnd: '#808FA8',
    ringTrack: 'rgba(70,80,102,0.2)',
    badgeBg: '#EFF2F8',
    badgeText: '#4A5770',
    missionBg: '#F4F6FB',
    missionBorder: 'rgba(95,108,133,0.2)',
    kpiBg: '#F0F3F9',
    shareBgStart: '#E8ECF5',
    shareBgEnd: '#D7E0EE',
    shareCardStart: '#F9FAFC',
    shareCardEnd: '#EEF2F8',
  },
  '65to79': {
    theme: 'partlySunny',
    scoreBand: '65to79',
    icon: '⛅️',
    labelKey: 'report.weather.partlySunny',
    decisionStateKey: 'report.summaryV2.decisionState.partlySunny',
    heroStart: '#F8EEDB',
    heroEnd: '#E5F1E8',
    ringStart: '#F3B24B',
    ringEnd: '#E09A5A',
    ringTrack: 'rgba(124,96,47,0.2)',
    badgeBg: '#FFF3DD',
    badgeText: '#6C5126',
    missionBg: '#FBF4E5',
    missionBorder: 'rgba(153,121,64,0.2)',
    kpiBg: '#F7F2E7',
    shareBgStart: '#F7EEDC',
    shareBgEnd: '#E5F0E5',
    shareCardStart: '#FFF9EE',
    shareCardEnd: '#F1F7EE',
  },
  '80plus': {
    theme: 'sunny',
    scoreBand: '80plus',
    icon: '☀️',
    labelKey: 'report.weather.sunny',
    decisionStateKey: 'report.summaryV2.decisionState.sunny',
    heroStart: '#FDEFCF',
    heroEnd: '#E9F6DF',
    ringStart: '#F4B429',
    ringEnd: '#F29145',
    ringTrack: 'rgba(132,102,47,0.2)',
    badgeBg: '#FFF4D8',
    badgeText: '#6E5120',
    missionBg: '#FDF5DF',
    missionBorder: 'rgba(161,126,55,0.2)',
    kpiBg: '#FAF4E3',
    shareBgStart: '#FCEECF',
    shareBgEnd: '#E9F4DD',
    shareCardStart: '#FFF9EB',
    shareCardEnd: '#F3F9EC',
  },
};

function clampScore(score: number) {
  if (!Number.isFinite(score)) {
    return 0;
  }
  return Math.max(0, Math.min(100, score));
}

export function resolveReportScoreBand(score: number): ReportScoreBand {
  const normalized = clampScore(score);
  if (normalized < 50) {
    return 'lt50';
  }
  if (normalized < 65) {
    return '50to64';
  }
  if (normalized < 80) {
    return '65to79';
  }
  return '80plus';
}

export function resolveReportWeatherTheme(score: number): ReportWeatherPalette {
  return WEATHER_THEME_BY_BAND[resolveReportScoreBand(score)];
}
