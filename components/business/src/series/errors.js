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
  error,
};
