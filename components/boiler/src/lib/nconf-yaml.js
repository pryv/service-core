const yaml = require('js-yaml');

exports.stringify = function (obj, options) {
  return yaml.dump(obj, options);
}

exports.parse = function (obj, options) {
  return yaml.load(obj, options);
}