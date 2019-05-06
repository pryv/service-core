/*global describe, it*/
'use strict';

require('./test-helpers'); 
var Result = require('../src/Result'),
    Transform = require('stream').Transform,
    inherits = require('util').inherits,
    should = require('should'),
    Source = require('./helpers').SourceStream;


describe('Result', function () {

  describe('toObject()', function () {

    it('D6BK-must return the result\'s content when not storing streams', function (done) {
      var res = new Result();
      res.a = 'a';

      function expectation(content) {
        content.a.should.eql('a');
        done();
      }

      res.toObject(expectation);
    });

    it('UHUE-must return the result content when storing streams', function (done) {
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

    it('VYMB-must return an error object when attempting to serialize streams containing an amount' +
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

    it('TNHH-must return an error when storing piped streams', function (done) {
      var res = new Result({arrayLimit: 2}),
          arrayName1 = 'items',
          array1 = [{a: 'a'}, {b: 'b'}, {c: 'c'}],
          s1 = new Source(array1);
      var p1 = s1.pipe(new SimpleTransformStream());

      function expectation(content) {
        should.exist(content);
        done();
      }

      res.addStream(arrayName1, p1);
      res.toObject(expectation);
    });

    it.skip('must return an error when the core pipeline crashes because of size', function () {
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