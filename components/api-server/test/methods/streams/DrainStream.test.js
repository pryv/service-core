/*global describe, it*/
'use strict';

var DrainStream = require('../../../src/methods/streams/DrainStream'),
    R = require('ramda'),
    should = require('should');

describe('DrainStream', function () {

  it('[AFWR] must be fed objects and return them in the callback', function (done) {

    var input = [{a: 'a'}, {b: 'b'}, {c: 'c'}];

    function expectation (err, array) {
      should.not.exist(err);
      (R.equals(array, input)).should.be.true();
      done();
    }

    var drain = new DrainStream({limit: 4}, expectation);

    input.forEach(function (item) {
      drain.write(item);
    });
    drain.end();
  });

  it('[23UQ] must return an error when the provided limit is exceeded', function (done) {

    function expectation(err) {
      should.exist(err);
      done();
    }

    var drain = new DrainStream({limit:1}, expectation);
    drain.write({a: 'a'});
    drain.write({b: 'b'});
  });
});
