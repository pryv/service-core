/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// 


// Type of an actual value.

const errors = require('./errors');

// A value of type 'number'.
//
class NumberType {
  coerce(value) {
    switch (typeof value) {
      case 'string':
        return this.coerceString(value);
      case 'number':
        return value;
    }

    throw new errors.InputTypeError(`Unknown outer type (${typeof value}).`);
  }

  coerceString(str) {
    const reNumber = /^\d+(\.\d+)?$/;
    if (! reNumber.test(str)) {
      throw new errors.InputTypeError(`Doesn't look like a valid number: '${str}'.`);
    }

    return Number.parseFloat(str);
  }
}

class BooleanType {
  coerce(value) {
    if (value === true) return true;
    if (value === false) return false;
    if (value === 'true') return true;
    if (value === 'false') return false;
    throw new errors.InputTypeError(`Doesn't look like a valid boolean: '${value}'.`);
  }
}

class StringType {
  coerce(value) {
    return '' + value;
  }
}

class NullType {
  coerce(/* value: any */) {
    return null;
  }
}

function produceInner(type) {
  switch (type) {
    case 'number': return new NumberType();
    case 'string': return new StringType();
    case 'null': return new NullType();
    case 'boolean': return new BooleanType();
  }

  throw new Error(`Unknown inner type: '${type}'.`);
}

module.exports = produceInner;
