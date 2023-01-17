/**
 * @license
 * Copyright (C) 2012–2023 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// Thrown when the request parsing fails.
//
class ParseFailure extends Error {
}
/**
 * @param {string} msg
 * @returns {Error}
 */
function error (msg) {
  return new ParseFailure(msg);
}
module.exports = {
  // error class
  ParseFailure,
  // error factories
  error
};
