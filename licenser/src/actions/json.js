const fs = require('fs');
const _ = require('lodash');
const sortPackageJson = require('sort-package-json');


async function action(fullPath, spec) {
  // load .json file
  let package = require(fullPath);
  if (spec.force) {
    package = _.merge(package, spec.force);
  }
  if (spec.defaults) {
    package = _.mergeWith(package, spec.defaults, function (src, dest) {
      if (typeof src === 'undefined') return dest;
      return src;
    });
  }
  if (spec.sortPackage) {
    package = sortPackageJson(package);
  }
  fs.writeFileSync(fullPath, JSON.stringify(package, null, 2));
}

/**
 * Eventually prepare fileSpecs (can be called multiple times)
 * @param {Object} actionItem 
 * @param {String} license - content of the license
 * @return {Function} the action to apply;
 */
async function prepare(actionItem, license) {
  actionItem.actionMethod = async function (fullPath) {
    console.log('JSON Handler >> ' + fullPath);
    await action(fullPath, actionItem);
  };
}


module.exports = {
  prepare: prepare,
  key: 'json'
}