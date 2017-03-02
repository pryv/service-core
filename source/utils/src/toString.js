/**
 * Output usual objects as string, e.g. when logging.
 * TODO: make that a separate lib to use on client side too
 */

var toString = module.exports = {};

toString.id = function (id) {
  return '"' + id + '"';
};

toString.path = function (path) {
  return '"' + path + '"';
};

toString.property = function (propertyKey) {
  return '`' + propertyKey + '`';
};

toString.user = function (user) {
  return '"' + user.username + '" (' + (user.id || user._id) + ')';
};
