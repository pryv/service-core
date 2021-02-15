/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

// Thrown when the request parsing fails. 
// 
class ParseFailure extends Error {
}

function error(msg: string): Error {
  return new ParseFailure(msg);
}

module.exports = {
  // error class
  ParseFailure, 
  
  // error factories
  error
};
