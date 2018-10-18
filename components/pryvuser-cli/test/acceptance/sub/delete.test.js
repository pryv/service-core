// @flow

/// Tests the 'OpDeleteUser' operation in isolation. 

const bluebird = require('bluebird');

const OpDeleteUser = require('../../../src/sub/delete');

/* global describe, it, beforeEach */

const chai = require('chai');
const assert = chai.assert; 
const sinon = require('sinon');

describe('OpDeleteUser', () => {
  const deleteParams = {
    parent: {
      interaction: false, 
    },
  };

  const config = {};
  const configLoader = {
    load: () => bluebird.resolve(config),
  };

  let op;
  beforeEach(() => {
    op = new OpDeleteUser(configLoader);
  });

  // Silences interaction with the user completely: 
  beforeEach(() => {
    // FLOW Forbidden assignment - used for mocking.
    op.interaction = {
      printConfigSummary: sinon.spy(), 
      print: sinon.spy(), 
      println: sinon.spy(), 
      itsOk: sinon.spy(), 
      error: sinon.spy(), 
    };
  });

  it('executes preflight and then deletes the user', async () => {
    // FLOW Forbidden assignment - used for mocking.
    op.preflightChecks = sinon.fake.resolves();
    // FLOW Forbidden assignment - used for mocking.
    op.getUserConfirmation = sinon.fake.resolves();
    // FLOW Forbidden assignment - used for mocking.
    op.deleteUser = sinon.fake.resolves();

    // Mock out the actual actions, see if things are called
    await op.run('jsmith', deleteParams);

    assert.strictEqual(op.preflightChecks.callCount, 1);
    assert.strictEqual(op.deleteUser.callCount, 1);
  });
  it('stops after preflight if preflight fails', async () => {
    // FLOW Forbidden assignment - used for mocking.
    op.preflightChecks = sinon.fake.rejects(new Error('Preflight says no'));
    // FLOW Forbidden assignment - used for mocking.
    op.getUserConfirmation = sinon.fake.resolves();
    // FLOW Forbidden assignment - used for mocking.
    op.deleteUser = sinon.fake.resolves();

    // Mock out the actual actions, see if things are called
    await op.run('jsmith', deleteParams);

    assert.strictEqual(op.preflightChecks.callCount, 1);
    assert.strictEqual(op.deleteUser.callCount, 0);
  });
  it('stops if user doesnt confirm', async () => {
    // FLOW Forbidden assignment - used for mocking.
    op.preflightChecks = sinon.fake.resolves();
    // FLOW Forbidden assignment - used for mocking.
    op.getUserConfirmation = sinon.fake.rejects(new Error('Simon says no'));
    // FLOW Forbidden assignment - used for mocking.
    op.deleteUser = sinon.fake.resolves();

    // Mock out the actual actions, see if things are called
    await op.run('jsmith', deleteParams);

    assert.strictEqual(op.preflightChecks.callCount, 1);
    assert.strictEqual(op.deleteUser.callCount, 0);
  });
});