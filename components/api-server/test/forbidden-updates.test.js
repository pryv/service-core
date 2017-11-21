/*global describe, it */

const commonFns = require('../src/methods/helpers/commonFunctions');
const streamSchema = require('../src/schema/stream');
const should = require('should');

describe('methods/helpers/commonFunctions.js: catchForbiddenUpdate(schema)', function () {
  const forbiddenUpdate = {
    update: {
      id: 'forbidden',
      modifiedBy: 'toto'
    }
  };

  it('must throw a forbidden error if "ignoreProtectedFieldUpdates" is null', function (done) {
    testForbiddenUpdate(forbiddenUpdate, null, done);
  });
  
  it('must throw a forbidden error if "ignoreProtectedFieldUpdates" is false', function (done) {
    testForbiddenUpdate(forbiddenUpdate, false, done);
  });
  
  it('must not throw any error if "ignoreProtectedFieldUpdates" is true but print a warn log', function (done) {
    testForbiddenUpdate(forbiddenUpdate, true, done);
  });
  
  function testForbiddenUpdate(update, ignoreProtectedFieldUpdates, done) {
    // Here we fake a logger to test that a warning is logged in non-strict mode
    const logger = {
      warn: function(msg) {
        should(ignoreProtectedFieldUpdates).be.true();
        should(msg.indexOf('Forbidden update was attempted on the following protected field(s)') >= 0).be.true();
        should(msg.indexOf('Server has "ignoreProtectedFieldUpdates" turned on: Fields are not updated, but no error is thrown.') >= 0).be.true();
        should(msg.indexOf('id') >= 0).be.true();
        should(msg.indexOf('modifiedBy') >= 0).be.true();
        done();
      }
    };
    const catchForbiddenUpdate = commonFns.catchForbiddenUpdate(streamSchema('update'), ignoreProtectedFieldUpdates, logger);
    catchForbiddenUpdate(null, forbiddenUpdate, null, function(err) {
      if(!ignoreProtectedFieldUpdates) {
        should.exist(err);
        done();
      } else if(err) {
        done(err);
      }
    });
  }
  
});