// @flow

/// Tests the 'OpDeleteUser' operation in isolation. 

const bluebird = require('bluebird');

const OpDeleteUser = require('../../../src/sub/delete');
const ConnectionManager = require('../../../src/connection_manager');

/* global describe, it, beforeEach */

const chai = require('chai');
const assert = chai.assert; 
const sinon = require('sinon');

describe('OpDeleteUser', () => {
  const config = {
    mongoDbSettings: () => {
      return { fileStore: {} };
    },
    influxDbSettings: () => {},
    registerSettings: () => {},
    fileStoreSettings: () => {},
  };
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
      trace: sinon.spy(), 
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
    await op.runWithoutErrorHandling('jsmith');

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

    assertRejects(() => op.runWithoutErrorHandling('jsmith'));
  });
  it('stops if user doesnt confirm', async () => {
    // FLOW Forbidden assignment - used for mocking.
    op.preflightChecks = sinon.fake.resolves();
    // FLOW Forbidden assignment - used for mocking.
    op.getUserConfirmation = sinon.fake.rejects(new Error('Simon says no'));
    // FLOW Forbidden assignment - used for mocking.
    op.deleteUser = sinon.fake.resolves();

    assertRejects(() => op.runWithoutErrorHandling('jsmith'));
  });

  describe('when stubbing connections to all subsystems', () => {
    const config = {};
    const configLoader = {
      load: () => bluebird.resolve(config),
    };
    
    let op;
    beforeEach(() => {
      op = new OpDeleteUser(configLoader);
    });

    // Create a connection manager stub that returns only mock connections. 
    let fakeMongoDb, fakeInfluxDb, fakeRegistry, fakeFileStore; 
    let connections; 
    let connManager; 
    beforeEach(async () => {
      const configuration = {};

      // FLOW For this test, we don't really need a configuration.
      connManager = new ConnectionManager(configuration);

      fakeMongoDb = {}; 
      fakeInfluxDb = {}; 
      fakeRegistry = {};
      fakeFileStore = {}; 

      connections = [fakeMongoDb, fakeInfluxDb, fakeRegistry, fakeFileStore];

      sinon.stub(connManager, 'mongoDbConnection').returns(fakeMongoDb); 
      sinon.stub(connManager, 'influxDbConnection').returns(fakeInfluxDb);
      sinon.stub(connManager, 'registryConnection').returns(fakeRegistry);
      sinon.stub(connManager, 'fileStoreConnection').returns(fakeFileStore);
    });
    
    it('completes preflight successfully', async () => {
      for (const conn of connections) {
        conn.preflight = sinon.fake.resolves(); 
      }

      await op.initSubsystems(connManager);
      await op.preflightChecks('jsmith');

      // If the above line doesn't throw, the test succeeds. 

      // Also, make sure we did indeed call 'preflight' on all connections. This
      // is ugly, I know. 
      for (const conn of connections) {
        assert.isNotNull(conn.preflight.lastCall);
      }
    });
    it('deletes the user', async () => {
      for (const conn of connections) {
        conn.deleteUser = sinon.fake.resolves();
      }

      await op.initSubsystems(connManager);
      await op.deleteUser('jsmith');

      // If the above line doesn't throw, the test succeeds. 

      // Also, make sure we did indeed call 'deleteUser' on all connections. This
      // is ugly, I know. 
      for (const conn of connections) {
        assert.isNotNull(conn.deleteUser.lastCall, '#deleteUser should have been called.');
      }
    });
  });

  // Calls `fun`; throws an AssertionError if fun doesn't return a promise that 
  // rejects (or throws a synchronous Error).
  // 
  async function assertRejects(fun) {
    let throws = false; 

    try {
      await fun();
    }
    catch (error) {
      throws = true; 
    }

    assert.isTrue(throws, 'Expected fun to throw, but did not.');
  }
});
