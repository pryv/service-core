/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const yaml = require('js-yaml');

exports.stringify = function (obj, options) {
  return yaml.dump(obj, options);
}

exports.parse = function (obj, options) {
  return yaml.load(obj, options);
}