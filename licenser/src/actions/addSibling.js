const path = require('path');
const fs = require('fs');

// add a LICENSE file in the same directory than the file

let licenseContent;

/**
 * Eventually prepare fileSpecs (can be called multiple times)
 * @param {Object} actionItem 
 * @param {String} license - content of the license
 * @return {Function} the action to apply;
 */
async function prepare(actionItem, license) {
  licenseContent = license;
  actionItem.actionMethod = async function (fullPath) {
    const licensePath = path.resolve(path.dirname(fullPath), 'LICENSE');
    fs.writeFileSync(licensePath, licenseContent);
  };
}


module.exports = {
  prepare: prepare,
  key: 'addSibling'
}