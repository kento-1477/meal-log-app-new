const path = require('path');

const absoluteAppPath = path.join(__dirname, 'app').replace(/\\/g, '/');

module.exports = function inlineExpoRouterRoot({ types: t }) {
  return {
    name: 'inline-expo-router-root',
    visitor: {
      MemberExpression(path) {
        if (
          t.isMemberExpression(path.node.object) &&
          t.isIdentifier(path.node.object.object, { name: 'process' }) &&
          t.isIdentifier(path.node.object.property, { name: 'env' })
        ) {
          if (t.isIdentifier(path.node.property, { name: 'EXPO_ROUTER_APP_ROOT' })) {
            path.replaceWith(t.stringLiteral('./app'));
          } else if (t.isIdentifier(path.node.property, { name: 'EXPO_ROUTER_IMPORT_MODE' })) {
            path.replaceWith(t.stringLiteral('sync'));
          } else if (t.isIdentifier(path.node.property, { name: 'EXPO_ROUTER_ABS_APP_ROOT' })) {
            path.replaceWith(t.stringLiteral(absoluteAppPath));
          }
        }
      },
    },
  };
};
