/* global describe, it */

const R = require('ramda');
const should = require('should');
const DrainStream = require('../../../src/methods/streams/DrainStream');

describe('DrainStream', () => {
  it('[AFWR] must be fed objects and return them in the callback', (done) => {
    const input = [{ a: 'a' }, { b: 'b' }, { c: 'c' }];

    function expectation(err, array) {
      should.not.exist(err);
      (R.equals(array, input)).should.be.true();
      done();
    }

    const drain = new DrainStream({ limit: 4 }, expectation);

    input.forEach((item) => {
      drain.write(item);
    });
    drain.end();
  });

  it('[23UQ] must return an error when the provided limit is exceeded', (done) => {
    function expectation(err) {
      should.exist(err);
      done();
    }

    const drain = new DrainStream({ limit: 1 }, expectation);
    drain.write({ a: 'a' });
    drain.write({ b: 'b' });
  });
});
