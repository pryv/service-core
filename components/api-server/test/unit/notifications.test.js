// @flow

/* global describe, it, beforeEach */
require('./test-helper');

const assert = require('chai').assert;

const Notifications = require('../../src/Notifications');

describe('Notifications', () => {
  let axonMsgs = []; 
  let emittedMsgs = []; 
  
  // Clear out received messages before each test. 
  beforeEach(() => {
    axonMsgs = []; 
    emittedMsgs = [];
  });
  
  // stub out axonSocket
  const axonSocket = {
    emit: (...args) => axonMsgs.push(args),
  };
  
  // Class under test
  const notifications = new Notifications(axonSocket); 
  
  // intercept internal events
  const eventNames = [
    'server-ready', 'account-changed', 'accesses-changed', 'followed-slices-changed', 
    'streams-changed', 'events-changed',
  ];
  for (const name of eventNames) {
    notifications.on(name, (...args) => {
      emittedMsgs.push([name].concat(args));
    });
  }
  
  describe('#serverReady', () => {
    beforeEach(() => {
      notifications.serverReady();
    });

    it('notifies internal listeners', () => {
      assert.deepInclude(emittedMsgs, ['server-ready']);
    });
    it('notifies axon listeners', () => {
      assert.deepInclude(axonMsgs, ['server-ready']);
    });
  });
  describe('#accountChanged', () => {
    beforeEach(() => {
      notifications.accountChanged('USERNAME');
    });

    it('notifies internal listeners', () => {
      assert.deepInclude(emittedMsgs, [ 'account-changed', 'USERNAME' ]);
    });
    it('notifies axon listeners', () => {
      assert.deepInclude(axonMsgs, [ 'account-changed', 'USERNAME' ]);
    });
  });
  describe('#accessesChanged', () => {
    beforeEach(() => {
      notifications.accessesChanged('USERNAME');
    });

    it('notifies internal listeners', () => {
      assert.deepInclude(emittedMsgs, [ 'accesses-changed', 'USERNAME' ]);
    });
    it('notifies axon listeners', () => {
      assert.deepInclude(axonMsgs, [ 'accesses-changed', 'USERNAME' ]);
    });
  });
  describe('#followedSlicesChanged', () => {
    beforeEach(() => {
      notifications.followedSlicesChanged('USERNAME');
    });

    it('notifies internal listeners', () => {
      assert.deepInclude(emittedMsgs, [ 'followed-slices-changed', 'USERNAME' ]);
    });
    it('notifies axon listeners', () => {
      assert.deepInclude(axonMsgs, [ 'followed-slices-changed', 'USERNAME' ]);
    });
  });
  describe('#streamsChanged', () => {
    beforeEach(() => {
      notifications.streamsChanged('USERNAME');
    });

    it('notifies internal listeners', () => {
      assert.deepInclude(emittedMsgs, [ 'streams-changed', 'USERNAME' ]);
    });
    it('notifies axon listeners', () => {
      assert.deepInclude(axonMsgs, [ 'streams-changed', 'USERNAME' ]);
    });
  });
  describe('#eventsChanged', () => {
    beforeEach(() => {
      notifications.eventsChanged('USERNAME');
    });

    it('notifies internal listeners', () => {
      assert.deepInclude(emittedMsgs, [ 'events-changed', 'USERNAME' ]);
    });
    it('notifies axon listeners', () => {
      assert.deepInclude(axonMsgs, [ 'events-changed', 'USERNAME' ]);
    });
  });
});