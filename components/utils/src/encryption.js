/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

/**
 * Encryption helper functions (wraps bcrypt functionality for hashing).
 */

const bcrypt = require('bcrypt');
const crypto = require('crypto');

const salt = bcrypt.genSaltSync(process.env.NODE_ENV === 'development' ? 1 : 10);

/**
 * @param {String} value The value to be hashed.
 * @returns {String} The hash
 */
exports.hash = async function (value: string) {
  return await bcrypt.hash(value, salt);
};

/**
 * For tests only.
 */
exports.hashSync = function (value: string): string {
  return bcrypt.hashSync(value, salt);
};

/**
 * @param {String} value The value to check
 * @param {String} hash The hash to check the value against
 * @return {Boolean} True if the value matches the hash
 */
exports.compare = async function (value: string, hash: string) {
  return await bcrypt.compare(value, hash);
};

/**
 * Computes the given file's read token for the given access and server secret.
 *
 * @param {String} fileId
 * @param {Object} access
 * @param {String} secret
 * @returns {String}
 */
exports.fileReadToken = function(fileId: string, accessId: string, accessToken: string, secret: string) {
  return accessId + '-' + getFileHMAC(fileId, accessToken, secret);
};

/**
 * Extracts the parts from the given file read token.
 *
 * @param {String} fileReadToken
 * @returns {Object} Contains `accessId` and `hmac` parts if successful; empty otherwise.
 */
exports.parseFileReadToken = function (fileReadToken: string) {
  var sepIndex = fileReadToken.indexOf('-');
  if (sepIndex <= 0) { return {}; }
  return {
    accessId: fileReadToken.substr(0, sepIndex),
    hmac: fileReadToken.substr(sepIndex + 1)
  };
};

exports.isFileReadTokenHMACValid = function (
  hmac: string, fileId: string, token: string,
  secret: string)
{
  return hmac === getFileHMAC(fileId, token, secret);
};

function getFileHMAC(fileId, token, secret): string {
  var hmac = crypto.createHmac('sha1', secret);
  hmac.setEncoding('base64');
  hmac.write(fileId + '-' + token);
  hmac.end();

  const base64HMAC = hmac.read();
  if (base64HMAC == null) throw new Error('AF: HMAC cannot be null');

  return base64HMAC
    .toString()   // function signature says we might have a buffer here.
    .replace(/\//g, '_').replace(/\+/g, '-').replace(/=/g, '');
}
