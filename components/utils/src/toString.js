/**
 * @license
 * Copyright (C) 2012–2023 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/**
 * Output usual objects as string, e.g. when logging.
 * TODO: make that a separate lib to use on client side too
 */
const toString = (module.exports = {});
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
  return '"' + user.username + '" (' + (user.id || user._id || 'n/a') + ')';
};

/**
 * @typedef {{
 *   username: string;
 *   id?: string;
 *   _id?: string;
 * }} User
 */
