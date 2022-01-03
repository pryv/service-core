/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

/* global describe, it, beforeEach */

const sinon = require('sinon');
const chai = require('chai');
const assert = chai.assert; 

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

  it('[9UOR] forwards calls', () => {
    target.foo = sinon.spy();
      
    // FLOW
    subject.foo('a', 'b', 'c');
    
    sinon.assert.calledOnce(target.foo); 
    sinon.assert.calledWith(target.foo, 'a', 'b', 'c');
  });
  it('[5AVE] catches and logs all exceptions, rethrowing afterwards', () => {
    target.foo = sinon.stub();
    
    target.foo.throws('foobar'); 
      
    // FLOW
    assert.throws(
      () => subject.foo('a', 'b', 'c')
    );

    sinon.assert.threw(target.foo);
    sinon.assert.calledOnce(logger.error);
    sinon.assert.calledWith(logger.error, 
      "Uncaught error: 'foobar' during call to Object#foo.");
  });
  it('[9J9U] also works for async methods, waiting for the eventual result', async () => {
    target.foo = sinon.stub();
    
    target.foo.rejects('foobar'); 
      
    const ret = subject.foo('a', 'b', 'c');
    assert.instanceOf(ret, Promise);

    await ret
      .then(() => assert.fail())
      .catch(err => assert.strictEqual(err.toString(), 'foobar'));
      
    sinon.assert.calledOnce(logger.error);
    sinon.assert.calledWith(logger.error, 
      "Uncaught error: 'foobar' during call to Object#foo.");
  });
});