/**
 * @license
 * Copyright (C) 2012–2024 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const errors = require('./errors');
// A value of type 'number'.
//

class NumberType {
  /**
   * @param {any} value
   * @returns {number}
   */
  coerce (value) {
    switch (typeof value) {
      case 'string':
        return this.coerceString(value);
      case 'number':
        return value;
    }
    throw new errors.InputTypeError(`Unknown outer type (${typeof value}).`);
  }

  /**
   * @param {string} str
   * @returns {number}
   */
  coerceString (str) {
    const reNumber = /^\d+(\.\d+)?$/;
    if (!reNumber.test(str)) {
      throw new errors.InputTypeError(`Doesn't look like a valid number: '${str}'.`);
    }
    return Number.parseFloat(str);
  }
}

class BooleanType {
  /**
   * @param {any} value
   * @returns {boolean}
   */
  coerce (value) {
    if (value === true) { return true; }
    if (value === false) { return false; }
    if (value === 'true') { return true; }
    if (value === 'false') { return false; }
    throw new errors.InputTypeError(`Doesn't look like a valid boolean: '${value}'.`);
  }
}

class StringType {
  /**
   * @param {any} value
   * @returns {string}
   */
  coerce (value) {
    return '' + value;
  }
}

class NullType {
  /**
   * @returns {null}
   */
  coerce /* value: any */() {
    return null;
  }
}
/**
 * @param {string} type
 * @returns {import("/Users/sim/Code/Pryv/dev/service-core/value_types.ts-to-jsdoc").ValueType}
 */
function produceInner (type) {
  switch (type) {
    case 'number':
      return new NumberType();
    case 'string':
      return new StringType();
    case 'null':
      return new NullType();
    case 'boolean':
      return new BooleanType();
  }
  throw new Error(`Unknown inner type: '${type}'.`);
}
module.exports = produceInner;

/** @typedef {Object} ValueType */
