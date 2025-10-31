function noop() {
  return null;
}

const runtime = {
  jsx: noop,
  jsxs: noop,
  jsxDEV: noop,
  Fragment: 'fragment',
};

module.exports = runtime;
module.exports.default = runtime;
module.exports.jsx = runtime.jsx;
module.exports.jsxs = runtime.jsxs;
module.exports.jsxDEV = runtime.jsxDEV;
module.exports.Fragment = runtime.Fragment;
