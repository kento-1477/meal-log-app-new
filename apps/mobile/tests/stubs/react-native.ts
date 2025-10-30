export const Platform = {
  OS: 'ios',
  select<T>(options: { ios?: T; android?: T; default?: T }) {
    return options.ios ?? options.default ?? null;
  },
};

export const Alert = {
  alert: () => undefined,
};

export default {
  Platform,
  Alert,
};
