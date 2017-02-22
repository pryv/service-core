/*global describe, it*/
'use strict';

var Result = require('../src/Result'),
    Readable = require('stream').Readable,
    Transform = require('stream').Transform,
    inherits = require('util').inherits,
    R = require('ramda'),
    _ = require('lodash'),
    should = require('should');


describe('Result', function () {

  describe('toObject()', function () {

    it('must return the result\'s content when not storing streams', function (done) {
      var res = new Result();
      res.a = 'a';

      function expectation(content) {
        content.a.should.eql('a');
        done();
      }

      res.toObject(expectation);
    });

    it('must return the result content when storing streams', function (done) {
      var res = new Result(),
          arrayName1 = 'items',
          array1 = [{a: 'a'}, {b: 'b'}, {c: 'c'}],
          s1 = new Source(array1),
          arrayName2 = 'items2',
          array2 = [{d: 'd'}, {e: 'e'}, {f: 'f'}],
          s2 = new Source(array2);

      function expectation(content) {
        (content[arrayName1]).should.eql(array1);
        (content[arrayName2]).should.eql(array2);
        done();
      }

      res.addStream(arrayName1, s1);
      res.addStream(arrayName2, s2);
      res.toObject(expectation);
    });

    it('must return an error object when attempting to serialize streams containing an amount' +
      'of objects exceeding the limit', function (done) {
      var res = new Result({arrayLimit: 2}),
          arrayName1 = 'items',
          array1 = [{a: 'a'}, {b: 'b'}, {c: 'c'}],
          s1 = new Source(array1),
          arrayName2 = 'items2',
          array2 = [{d: 'd'}, {e: 'e'}, {f: 'f'}],
          s2 = new Source(array2);

      function expectation(content) {
        should.exist(content);
        done();
      }

      res.addStream(arrayName1, s1);
      res.addStream(arrayName2, s2);
      res.toObject(expectation);
    });

    it.skip('must return an error when storing piped streams', function (done) {
      var res = new Result({arrayLimit: 2}),
          arrayName1 = 'items',
          array1 = [{a: 'a'}, {b: 'b'}, {c: 'c'}],
          s1 = new Source(array1),
          arrayName2 = 'items2',
          array2 = [{d: 'd'}, {e: 'e'}, {f: 'f'}],
          s2 = new Source(array2);
      var p1 = s1.pipe(new AddPropertyStream({k: 'k'})),
          p2 = s2.pipe(new AddPropertyStream({l: 'l'}));

      function expectation(content) {
        should.exist(content);
        done();
      }

      res.addStream(arrayName1, p1);
      res.addStream(arrayName2, p2);
      res.toObject(expectation);

    });

  });
});


/**
 * Readable stream outputing the objects of the array passed in parameters
 *
 * @param array
 * @constructor
 */
function Source(array) {
  Readable.call(this, {objectMode: true});
  this.array = R.clone(array); // shift changes in place
}

inherits(Source, Readable);

Source.prototype._read = function () {
  if (!this.array || this.array.length === 0) {
    this.push(null);
  }
  else {
    var reading = this.array.shift();
    this.push(reading);
  }
};

/**
 * Stream that adds a property to each object
 *
 * @param prop
 */
function AddPropertyStream(prop) {
  this.prop = prop;
}

inherits(AddPropertyStream, Transform);

AddPropertyStream.prototype._transform = function (item, encoding, callback) {
  this.push(_.extend(item, this.prop));
  callback();
};

AddPropertyStream.prototype._flush = function (callback) {
  callback();
};