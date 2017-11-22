/**
 * Encryption helper functions (wraps bcrypt functionality for hashing).
 */

var bcrypt = require('bcrypt'),
    crypto = require('crypto');

var salt = bcrypt.genSaltSync(process.env.NODE_ENV === 'development' ? 1 : 10);

/**
 * @param {String} value The value to be hashed.
 * @param {Function} callback (error, hash)
 */
exports.hash = function (value, callback) {
  bcrypt.hash(value, salt, callback);
};

/**
 * For tests only.
 */
exports.hashSync = function (value) {
  return bcrypt.hashSync(value, salt);
};

/**
 * @param {String} value The value to check
 * @param {String} hash The hash to check the value against
 * @param {Function} callback (error, {Boolean} result)
 */
exports.compare = function (value, hash, callback) {
  bcrypt.compare(value, hash, callback);
};

/**
 * Computes the given file's read token for the given access and server secret.
 *
 * @param {String} fileId
 * @param {Object} access
 * @param {String} secret
 * @returns {string}
 */
exports.fileReadToken = function (fileId, access, secret) {
  return access.id + '-' + getFileHMAC(fileId, access, secret);
};

/**
 * Extracts the parts from the given file read token.
 *
 * @param {String} fileReadToken
 * @returns {Object} Contains `accessId` and `hmac` parts if successful; empty otherwise.
 */
exports.parseFileReadToken = function (fileReadToken) {
  var sepIndex = fileReadToken.indexOf('-');
  if (sepIndex <= 0) { return {}; }
  return {
    accessId: fileReadToken.substr(0, sepIndex),
    hmac: fileReadToken.substr(sepIndex + 1)
  };
};

exports.isFileReadTokenHMACValid = function (hmac, fileId, access, secret) {
  return hmac === getFileHMAC(fileId, access, secret);
};

function getFileHMAC(fileId, access, secret) {
  var hmac = crypto.createHmac('sha1', secret);
  hmac.setEncoding('base64');
  hmac.write(fileId + '-' + access.token);
  hmac.end();
  return hmac.read().replace(/\//g, '_').replace(/\+/g, '-').replace(/=/g, '');
}
