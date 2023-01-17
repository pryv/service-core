/**
 * @license
 * Copyright (C) 2012–2023 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

'use strict';

const ArrayStream = require('../../../src/methods/streams/ArrayStream');
const Writable = require('stream').Writable;
const inherits = require('util').inherits;
const should = require('should');
const Source = require('../../helpers').SourceStream;

describe('ArrayStream', function () {
  const arraySize = new ArrayStream('getSize', true).size;

  describe('testing around the array size limit', function () {
    const testIDs = ['U21Z', 'MKNL', 'MUPF', 'CM4Q', 'F8S9', '6T4V', 'QBOS', 'BY67', 'JNVS', 'N9HG'];

    for (let i = -3; i <= 3; i++) {
      const sign = i < 0 ? '' : '+';
      it(`[${testIDs[i + 3]}] must return a valid array when receiving limit` + sign + i + ' items',
        function (done) {
          const n = arraySize + i;
          n.should.be.above(0);
          pipeAndCheck(n, true, null, done);
        }
      );
    }
  });

  describe('testing with small number of items', function () {
    const testIDs = ['69F6', 'BJRT', 'YJI0', 'EKQQ', '5SUK', 'FPL8', 'ZMO9', 'WFSL', '1YQS', '25IQ'];

    for (let i = 0; i <= 3; i++) {
      it(`[${testIDs[i]}] must return a valid array when receiving ` + i + ' item(s)',
        function (done) {
          pipeAndCheck(i, true, null, done);
        }
      );
    }
  });

  it('[TWNI] must return an array preceded by a comma when called with parameter isFirst=false',
    function (done) {
      const n = 10;

      pipeAndCheck(n, false, (res) => {
        res.charAt(0).should.eql(',');
        return '{' + res.slice(1) + '}';
      }, done);
    }
  );

  function pipeAndCheck (itemNumber, isFirst, resultMapping, done) {
    const name = 'name';

    const items = [];
    for (let i = 0; i < itemNumber; i++) {
      items.push({
        a: 'a',
        n: i
      });
    }

    new Source(items)
      .pipe(new ArrayStream(name, isFirst))
      .pipe(new DestinationStream(isFirst, (err, res) => {
        should.not.exist(err);
        should.exist(res);
        if (typeof (resultMapping) === 'function') {
          res = resultMapping(res);
        }
        res = JSON.parse(res);
        should.exist(res[name]);
        res[name].should.eql(items);
        done();
      }));
  }
});

/**
 * Writable stream that concatenates the strings it receives in a buffer.
 * When finished, it flushes its buffer in a JS object '{}' or as is depending
 * on the asObject parameter
 *
 * @param asObject  if true, flushes the buffer in a JS object,
 *                  otherwise, flushes it as is.
 * @param callback
 * @constructor
 */
function DestinationStream (asObject, callback) {
  Writable.call(this);

  this.result = '';
  this.asObject = asObject;

  if (callback) {
    this.on('finish', function () {
      if (this.asObject) {
        callback(null, '{' + this.result + '}');
      } else {
        callback(null, this.result);
      }
    });
  }

  this.on('error', callback);
}

inherits(DestinationStream, Writable);

DestinationStream.prototype._write = function (object, enc, next) {
  this.result += (object);
  next();
};
