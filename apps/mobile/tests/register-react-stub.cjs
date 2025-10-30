const Module = require('node:module');
const path = require('node:path');

const reactStubPath = path.resolve(__dirname, 'stubs', 'react.js');
const reactJsxRuntimeStubPath = path.resolve(__dirname, 'stubs', 'react-jsx-runtime.js');

const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function patchedResolve(request, parent, isMain, options) {
  if (request === 'react') {
    return reactStubPath;
  }
  if (request === 'react/jsx-runtime' || request === 'react/jsx-dev-runtime') {
    return reactJsxRuntimeStubPath;
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};
