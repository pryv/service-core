// @flow

// Unit tests for methodCallback.js

/* global describe, it, beforeEach */
const should = require('should');
const methodCallback = require('../../../src/routes/methodCallback');
const Result = require('../../../src/Result');

describe('methodCallback', function() {

  describe('Pryv-Access-Id header', function() {

    const accessId = 'access_id';
    let res, headers;
    beforeEach(() => {
      res = {
        req: {
          context: {
            access: {id: accessId},
          }
        },
        get: (key) => {
          return headers[key];
        },
        header: (key, value) => {
          headers[key] = value;
        },
      };
      headers = {};
    });

    it('[DI8E] adds the access id in a specific header in case of success', function(done) {
      // In this case we expect the 'writeToHttpResponse' function to be called with the API result
      // and the 'res' containing the access id header.
      const result = new Result(res);
      // FLOW Mocking the writeToHttpResponse method
      result.writeToHttpResponse = (res) => {
        expectAccessIdHeader(res, done);
      };
      const next = () => {
        done('Next should not be called in the success case.');
      };
      // FLOW Mocking express$Response and express$NextFunction
      const cb = methodCallback(res, next, 200);
      cb(null, result);
    });

    it('[E2OH] adds the access id in a specific header in case of error', function(done) {
      // In this case we expect the 'next' function to be called with the API error
      // but also with the 'res' containing the access id header.
      const next = (err) => {
        should.exist(err);
        expectAccessIdHeader(res, done);
      };
      // FLOW Mocking express$Response and express$NextFunction
      const cb = methodCallback(res, next, 200);
      cb(new Error('Fake error'), null);
    });

    function expectAccessIdHeader(res, done) {
      const accessIdHeader = res.get('Pryv-Access-Id');
      should.exist(accessIdHeader);
      accessIdHeader.should.eql(accessId);
      done();
    }
  });
});
