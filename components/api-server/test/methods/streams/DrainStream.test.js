/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

'use strict';

const DrainStream = require('../../../src/methods/streams/DrainStream');
const _ = require('lodash');
const should = require('should');

describe('DrainStream', function () {
  it('[AFWR] must be fed objects and return them in the callback', function (done) {
    const input = [{ a: 'a' }, { b: 'b' }, { c: 'c' }];

    function expectation (err, array) {
      should.not.exist(err);
      (_.isEqual(array, input)).should.be.true();
      done();
    }

    const drain = new DrainStream({ limit: 4 }, expectation);

    input.forEach(function (item) {
      drain.write(item);
    });
    drain.end();
  });

  it('[23UQ] must return an error when the provided limit is exceeded', function (done) {
    function expectation (err) {
      should.exist(err);
      done();
    }

    const drain = new DrainStream({ limit: 1 }, expectation);
    drain.write({ a: 'a' });
    drain.write({ b: 'b' });
  });
});
