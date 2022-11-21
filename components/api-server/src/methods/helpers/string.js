/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/**
 * Helper for handling query string parameter values.
 */

const string = module.exports;

string.isReservedId = function (s) {
  switch (s) {
    case 'null':
    case 'undefined':
    case '*':
      return true;
    default:
      return false;
  }
};

string.toMongoKey = function (s) {
  return (s[0] === '$' ? '_' + s.substr(1) : s).replace('.', ':');
};
