/*global describe, it */

const commonFns = require('../src/methods/helpers/commonFunctions');
const streamSchema = require('../src/schema/stream');
const should = require('should');
const dependencies = require('./helpers/dependencies');
const _ = require('lodash');

describe('methods/helpers/commonFunctions.js: catchForbiddenUpdate(schema)', function () {
  const forbiddenUpdate = {
    update: {
      'id': 'forbidden'
    }
  };

  it('must throw a forbidden error if "ignoreProtectedFieldUpdates" is null', function (done) {
    let settings = _.clone(dependencies.settings);
    settings.ignoreProtectedFieldUpdates = null;
    testForbiddenUpdate(forbiddenUpdate, true, done);
  });
  
  it('must throw a forbidden error if "ignoreProtectedFieldUpdates" is false', function (done) {
    let settings = _.clone(dependencies.settings);
    settings.ignoreProtectedFieldUpdates = false;
    testForbiddenUpdate(forbiddenUpdate, true, done);
  });
  
  it('must not throw any error if "ignoreProtectedFieldUpdates" is true but print a warn log', function (done) {
    let settings = _.clone(dependencies.settings);
    settings.ignoreProtectedFieldUpdates = true;
    testForbiddenUpdate(forbiddenUpdate, false, done);
  });
  
  function testForbiddenUpdate(update, shouldThrow, done) {
    // Here we fake a logger to test that a warning is logged in non-strict mode
    const logger = {
      warn: function(msg) {
        should(shouldThrow).be.false();
        should(msg.indexOf('Update is forbidden on the following properties') >= 0).be.true();
        should(msg.indexOf('id') >= 0).be.true();
        done();
      }
    };
    const catchForbiddenUpdate = commonFns.catchForbiddenUpdate(streamSchema('update'), logger);
    catchForbiddenUpdate(null, forbiddenUpdate, null, function(err) {
      if(shouldThrow) {
        should.exist(err);
        done();
      } else if(err) {
        done(err);
      }
    });
  }
  
});