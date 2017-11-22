/*global describe, it*/
'use strict';

var ArrayStream = require('../../../src/methods/streams/ArrayStream'),
    Writable = require('stream').Writable,
    inherits = require('util').inherits,
    should = require('should'),
    Source = require('../../helpers').SourceStream;

describe('ArrayStream', function () {

  it('must return a valid array when receiving less than the limit items', function (done) {
    var items = [],
      name = 'name';
    for (var i = 0; i < 10; i++) {
      items.push({
        a: 'a',
        n: i
      });
    }

    function expectation(err, res) {
      should.not.exist(err);
      should.exist(res);
      res = JSON.parse(res);
      should.exist(res[name]);
      res[name].should.eql(items);
      done();
    }

    new Source(items)
      .pipe(new ArrayStream(name, true))
      .pipe(new DestinationStream(true, expectation));

  });

  it('must return a valid array when receiving more than the limit items', function (done) {
    var items = [],
      name = 'name';

    var aStream = new ArrayStream(name, true);

    for (var i = 0; i < aStream.size + 10; i++) {
      items.push({
        a: 'a',
        n: i
      });
    }

    function expectation(err, res) {
      should.not.exist(err);
      should.exist(res);
      res = JSON.parse(res);
      should.exist(res[name]);
      res[name].should.eql(items);
      done();
    }

    new Source(items)
      .pipe(aStream)
      .pipe(new DestinationStream(true, expectation));
  });

  it('must return a valid empty array when receiving zero items', function (done) {
    var items = [],
      name = 'name';

    function expectation(err, res) {
      should.not.exist(err);
      should.exist(res);
      res = JSON.parse(res);
      should.exist(res[name]);
      res[name].should.eql(items);
      done();
    }

    new Source(items)
      .pipe(new ArrayStream(name, true))
      .pipe(new DestinationStream(true, expectation));
  });

  it('must return an array preceded by a comma when called with parameter isFirst=false',
    function (done) {
      var items = [],
        name = 'name';
      for (var i = 0; i < 10; i++) {
        items.push({
          a: 'a',
          n: i
        });
      }

      function expectation(err, res) {
        should.not.exist(err);
        should.exist(res);
        res.charAt(0).should.eql(',');
        res = '{' + res.slice(1) + '}';
        res = JSON.parse(res);
        should.exist(res[name]);
        res[name].should.eql(items);
        done();
      }

      new Source(items)
        .pipe(new ArrayStream(name, false))
        .pipe(new DestinationStream(false, expectation));
    });
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
