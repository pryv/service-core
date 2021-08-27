/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/*global describe, it*/
'use strict';

require('./test-helpers'); 
var Result = require('../src/Result'),
    Transform = require('stream').Transform,
    inherits = require('util').inherits,
    should = require('should'),
    Source = require('./helpers').SourceStream;


describe('Result', function () {

  describe('concatStream', function () { 
    it('[36RQ] must concatenate multiple streams in a single Array', function (done) {
      const res = new Result();
      const a1 = ['a','b','c'];
      const a2 = ['d','e','f'];
      const s1 = new Source(a1);
      const s2 = new Source(a2);

      function expectation(err, content) {
        should.not.exist(err);
        content.should.eql({events: a1.concat(a2)});
        done();
      }
      res.addToConcatArrayStream('events', s1);
      res.addToConcatArrayStream('events', s2);
      res.closeConcatArrayStream('events');
      res.toObject(expectation);
    });
  });

  describe('toObject()', function () {

    it('[NKHF] must return the result\'s content when not storing streams', function (done) {
      var res = new Result();
      res.a = 'a';

      function expectation(err, content) {
        should.not.exist(err);
        content.a.should.eql('a');
        done();
      }

      res.toObject(expectation);
    });

    it('[MHAS] must return the result content when storing streams', function (done) {
      var res = new Result(),
          arrayName1 = 'items',
          array1 = [{a: 'a'}, {b: 'b'}, {c: 'c'}],
          s1 = new Source(array1),
          arrayName2 = 'items2',
          array2 = [{d: 'd'}, {e: 'e'}, {f: 'f'}],
          s2 = new Source(array2);

      function expectation(err, content) {
        should.not.exist(err);
        (content[arrayName1]).should.eql(array1);
        (content[arrayName2]).should.eql(array2);
        done();
      }

      res.addStream(arrayName1, s1);
      res.addStream(arrayName2, s2);
      res.toObject(expectation);
    });

    it('[6P4Z] must return an error object when attempting to serialize streams containing an amount' +
      'of objects exceeding the limit', function (done) {
      var res = new Result({arrayLimit: 2}),
          arrayName1 = 'items',
          array1 = [{a: 'a'}, {b: 'b'}, {c: 'c'}],
          s1 = new Source(array1),
          arrayName2 = 'items2',
          array2 = [{d: 'd'}, {e: 'e'}, {f: 'f'}],
          s2 = new Source(array2);

      function expectation(err, content) {
        should.exist(err);
        should.not.exist(content);
        done();
      }

      res.addStream(arrayName1, s1);
      res.addStream(arrayName2, s2);
      res.toObject(expectation);
    });

    it('[TTEL] must return an error when storing piped streams', function (done) {
      var res = new Result({arrayLimit: 2}),
          arrayName1 = 'items',
          array1 = [{a: 'a'}, {b: 'b'}, {c: 'c'}],
          s1 = new Source(array1);
      var p1 = s1.pipe(new SimpleTransformStream());

      function expectation(err, content) {
        should.exist(err);
        should.not.exist(content);
        done();
      }

      res.addStream(arrayName1, p1);
      res.toObject(expectation);
    });

    it.skip('[H2GC] must return an error when the core pipeline crashes because of size', function () {
    });

  });
});




/**
 * Stream simply forwards what he receives. Used for pipe case.
 */
function SimpleTransformStream() {
  Transform.call(this, {objectMode: true});
}

inherits(SimpleTransformStream, Transform);

SimpleTransformStream.prototype._transform = function (item, encoding, callback) {
  this.push(item);
  callback();
};

SimpleTransformStream.prototype._flush = function (callback) {
  callback();
};