function noop() {}

function useState(initial) {
  let value = initial;
  const setValue = (next) => {
    value = typeof next === 'function' ? next(value) : next;
  };
  return [value, setValue];
}

function useSyncExternalStore(subscribe, getSnapshot) {
  if (typeof subscribe === 'function') {
    const unsubscribe = subscribe(() => undefined);
    if (typeof unsubscribe === 'function') {
      unsubscribe();
    }
  }
  return typeof getSnapshot === 'function' ? getSnapshot() : undefined;
}

const React = {
  useState,
  useEffect: noop,
  useLayoutEffect: noop,
  useMemo: (factory) => factory(),
  useCallback: (fn) => fn,
  useRef: (value) => ({ current: value }),
  useSyncExternalStore,
  createElement: () => null,
  Fragment: 'fragment',
  forwardRef: (component) => component,
};

module.exports = React;
module.exports.default = React;
module.exports.useState = React.useState;
module.exports.useEffect = React.useEffect;
module.exports.useLayoutEffect = React.useLayoutEffect;
module.exports.useMemo = React.useMemo;
module.exports.useCallback = React.useCallback;
module.exports.useRef = React.useRef;
module.exports.useSyncExternalStore = React.useSyncExternalStore;
module.exports.createElement = React.createElement;
module.exports.Fragment = React.Fragment;
module.exports.forwardRef = React.forwardRef;
