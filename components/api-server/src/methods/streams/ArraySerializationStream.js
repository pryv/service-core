/**
 * @license
 * Copyright (C) 2012–2023 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const Transform = require('stream').Transform;

const SERIALIZATION_STACK_SIZE = 2048;

/**
 * Stream that encapsulates the items it receives in a stringified array.
 *
 * @param arrayName {String} array name that will prefix the array
 * @constructor
 */
module.exports = class ArraySerializationStream extends Transform {
  constructor (arrayName) {
    super({ writableObjectMode: true });
    this.isStart = true;
    this.prefix = '"' + arrayName + '":';
    this.size = SERIALIZATION_STACK_SIZE;
    this.stack = [];
  }

  _transform (item, encoding, callback) {
    this.stack.push(item);

    if (this.stack.length >= this.size) {
      if (this.isStart) {
        this.isStart = false;
        this.push((this.prefix + JSON.stringify(this.stack)).slice(0, -1));
      } else {
        this.push(',' + (JSON.stringify(this.stack)).slice(1, -1));
      }
      this.stack = [];
    }
    callback();
  }

  _flush = function (callback) {
    if (this.isStart) {
      this.push(this.prefix + JSON.stringify(this.stack));
    } else {
      const joiningComma = this.stack.length > 0 ? ',' : '';
      this.push(joiningComma + (JSON.stringify(this.stack)).slice(1));
    }
    this.push(',');
    callback();
  };
};
