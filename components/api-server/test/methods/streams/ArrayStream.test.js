/*global describe, it*/
'use strict';

const ArrayStream = require('../../../src/methods/streams/ArrayStream');
const Writable = require('stream').Writable;
const inherits = require('util').inherits;
const should = require('should');
const Source = require('../../helpers').SourceStream;

describe('ArrayStream', function () {
  
  const arraySize = new ArrayStream('getSize', true).size;
  
  describe('testing around the array size limit', function () {
    for (let i = -3; i <= 3; i++) {
      it('must return a valid array when receiving limit+(' + i + ') items',
        function (done) {
          const n = arraySize+i;
          n.should.be.above(0);
          pipeAndCheck(n, true, null, done);
        }
      );
    }
  });
  
  describe('testing with small number of items', function () {
    for (let i = 0; i <= 3; i++) {
      it('must return a valid array when receiving (' + i + ') item(s)',
        function (done) {
          pipeAndCheck(i, true, null, done);
        }
      );
    }
  });

  it('must return an array preceded by a comma when called with parameter isFirst=false',
    function (done) {
      const n = 10;

      pipeAndCheck(n, false, (res) => {
        res.charAt(0).should.eql(',');
        return '{' + res.slice(1) + '}';
      }, done);
    }
  );
    
  function pipeAndCheck(itemNumber, isFirst, resultMapping, done) {
    const name = 'name';
    
    let items = [];
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
        if(typeof(resultMapping) == 'function') {
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
function DestinationStream(asObject, callback) {
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
