// @flow

/* global describe, it, beforeEach */

const sinon = require('sinon');

const { ErrorLogger } = require('../../../src/metadata_updater/error_logger');

describe('ErrorLogger', () => {
  let logger;
  let target, subject;
  beforeEach(() => {
    logger = {
      debug: sinon.spy(),
      info: sinon.spy(),
      warn: sinon.spy(),
      error: sinon.spy(),
    };
    target = {};
    subject = ErrorLogger.wrap(target, logger);
  });

  it('forwards calls', () => {
    target.foo = sinon.spy();
      
    // FLOW
    subject.foo('a', 'b', 'c');
    
    sinon.assert.calledOnce(target.foo); 
    sinon.assert.calledWith(target.foo, 'a', 'b', 'c');
  });
  it('catches and logs all exceptions, rethrowing afterwards', () => {
    target.foo = sinon.stub();
    
    target.foo.throws('foobar'); 
      
    // FLOW
    try {
      subject.foo('a', 'b', 'c');
    }
    catch (err) {
      // IGNORE
    }

    sinon.assert.threw(target.foo);
    sinon.assert.calledOnce(logger.error);
    sinon.assert.calledWith(logger.error, 
      "Uncaught error: 'foobar' during call to Object#foo.");
  });
});