/**
 * Add license at the END of the file
 * 
 * WARNING Does not have a "endBlock" search so everything after the license "startBlock" will be removed! 
 */

const fs = require('fs');

/**
 * Check if file already has this as a trailer
 * @param {string} fullPath 
 * @param {Object} spec 
 */
async function checkFileAndClean(fullPath, spec) {
  let fileContent = fs.readFileSync(fullPath, 'utf8');
  const endBlockPos = fileContent.lastIndexOf(spec.startBlock);
  if (endBlockPos > 1) {
    //const toBeRemoved = fileContent.substr(fileContent.indexOf(spec.startBlock) + spec.startBlock.length)
    //console.log('toBeRemoved >> ' + fullPath, toBeRemoved);
    fileContent = fileContent.substr(0, fileContent.indexOf(spec.startBlock));
  }
  fs.writeFileSync(fullPath, fileContent + spec.license);
  console.log('Updated triling >> ' + fullPath);
  return true;
}


/**
 * Eventually prepare fileSpecs (can be called multiple times)
 * Add actionMethod function to be called on each matched file
 * 
 * @param {Object} fileSpecs 
 * @param {String} license - content of the license
 */
async function prepare(spec, license) {
  spec.license = '\n' + spec.startBlock + license.split('\n').join('\n' + spec.lineBlock) + spec.endBlock; // prepare license block
  spec.actionMethod = async function (fullPath) {
    await checkFileAndClean(fullPath, spec);
  };
}

module.exports = {
  prepare: prepare,
  key: 'addTrailer'
}