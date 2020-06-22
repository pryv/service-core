const fs = require('fs');
const prepend = require('prepend-file');

/**
 * Check the firts "n" bytes of a file to see if it matches the startBlock
 * If yes clean the file up to the end
 * @param {string} fullPath 
 * @param {Object} spec 
 */
async function checkFileHeaderAndClean(fullPath, spec) {
  const fd = fs.openSync(fullPath, 'r');
  const buffer = Buffer.alloc(spec.startBlockLength);
  fs.readSync(fd, buffer, 0, spec.startBlockLength, 0);
  //console.log(buffer, buffer.toString('utf-8'), spec.startBlockLength);
  fs.closeSync(fd);
  if (!buffer.equals(spec.startBlockBuffer)) return false; // does not match return
  // startBlock found read all file and rewrite without startBlock
  const fileContent = fs.readFileSync(fullPath, 'utf8');
  const endBlockPos = fileContent.indexOf(spec.endBlock);
  //onsole.log('Updated >> ' + fullPath);
  fs.writeFileSync(fullPath, fileContent.substr(fileContent.indexOf(spec.endBlock) + spec.endBlock.length));
  return true;
}

/**
 * Perfoem the action on this file with this spec
 */
async function action(fullPath, spec) {
  const cleaned = await checkFileHeaderAndClean(fullPath, spec);
  prepend.sync(fullPath, spec.license);
}

/**
 * Eventually prepare fileSpecs (can be called multiple times)
 * Add actionMethod function to be called on each matched file
 * 
 * @param {Object} fileSpecs 
 * @param {String} license - content of the license
 */
async function prepare(spec, license) {
  spec.startBlockBuffer = Buffer.from(spec.startBlock, 'utf-8'); // save startBlock as Buffer for fast check
  spec.startBlockLength = spec.startBlockBuffer.length;
  let myLicense = '' + license;
  if (spec.lineBlock !== '') {
    myLicense = myLicense.split('\n').join('\n' + spec.lineBlock)
  }
  spec.license = spec.startBlock + myLicense + spec.endBlock; // prepare license block
  spec.actionMethod = async function (fullPath) {
    await action(fullPath, spec);
  };
}

module.exports = {
  prepare: prepare,
  key: 'addHeader'
}