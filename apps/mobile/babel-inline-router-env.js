const path = require('path');
const absAppPath = path.join(__dirname, 'app').replace(/\\/g, '/');

module.exports = function inlineRouterEnv({ types: t }) {
  return {
    name: 'inline-router-env',
    visitor: {
      MemberExpression(path) {
        if (
          t.isMemberExpression(path.node.object) &&
          t.isIdentifier(path.node.object.object, { name: 'process' }) &&
          t.isIdentifier(path.node.object.property, { name: 'env' })
        ) {
          const prop = path.node.property;
          if (t.isIdentifier(prop, { name: 'EXPO_ROUTER_APP_ROOT' })) {
            path.replaceWith(t.stringLiteral('./app'));
          } else if (t.isIdentifier(prop, { name: 'EXPO_ROUTER_ABS_APP_ROOT' })) {
            path.replaceWith(t.stringLiteral(absAppPath));
          } else if (t.isIdentifier(prop, { name: 'EXPO_ROUTER_IMPORT_MODE' })) {
            path.replaceWith(t.stringLiteral('sync'));
          }
        }
      },
    },
  };
};
