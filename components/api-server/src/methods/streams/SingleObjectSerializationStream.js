/**
 * @license
 * Copyright (C) 2012–2023 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const Transform = require('stream').Transform;

/**
 * Stream that serialize the first object it receives.
 *
 * @param objectName {String} array name that will prefix the array
 * @constructor
 */
module.exports = class SingleObjectSerializationStream extends Transform {
  name;
  constructor (objectName) {
    super({ writableObjectMode: true });
    this.name = objectName;
  }

  _transform = function (item, encoding, callback) {
    this.push('"' + this.name + '": ' + JSON.stringify(item) + ', ');
    callback();
  };

  _flush = function (callback) {
    callback();
  };
};
