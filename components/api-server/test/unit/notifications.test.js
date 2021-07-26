/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

/* global describe, it, beforeEach */
require('./test-helper');

const assert = require('chai').assert;

const { Notifications } = require('messages');
const { pubsub } = require('messages');

const username = 'USERNAME';

describe('Notifications', () => {
  let axonMsgs = []; 
  let emittedMsgs = []; 
  let pubsubReceivedMsgs = []; 
  
  // Clear out received messages before each test. 
  beforeEach(() => {
    axonMsgs = []; 
    emittedMsgs = [];
    pubsubReceivedMsgs = [];
  });

  let removablePubSubListener
  before(async () => {
    await pubsub.init();
    removablePubSubListener = pubsub.onAndGetRemovable(username, function(message) {
      pubsubReceivedMsgs.push(message);
    });
  });

  after(() => {
    removablePubSubListener();
  });
  
  // stub out axonSocket
  const axonSocket = {
    emit: (...args) => axonMsgs.push(args),
  };
  
  // Class under test
  const notifications = new Notifications(axonSocket); 
  
  // intercept internal events
  const eventNames = [
    pubsub.SERVER_READY, 'account-changed', pubsub.USERNAME_BASED_ACCESSES_CHANGED, 'followed-slices-changed', 
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

    it('[B76G] notifies internal listeners', () => {
      assert.deepInclude(emittedMsgs, [pubsub.SERVER_READY]);
    });
    it('[SRAU] notifies axon listeners', () => {
      assert.deepInclude(axonMsgs, [pubsub.SERVER_READY]);
    });
  });
  describe('#accountChanged', () => {
    beforeEach(() => {
      notifications.accountChanged(username);
    });

    it('[P6ZD] notifies internal listeners', () => {
      assert.deepInclude(emittedMsgs, [ 'account-changed', username ]);
    });
    it('[Q96S] notifies axon listeners', () => {
      assert.deepInclude(axonMsgs, [ 'account-changed', username ]);
    });
  });
  describe('#accessesChanged', () => {
    beforeEach(() => {
      notifications.accessesChanged(username);
    });

    it('[P5CG] notifies internal listeners', () => {
      assert.deepInclude(pubsubReceivedMsgs, pubsub.USERNAME_BASED_ACCESSES_CHANGED);
    });
    it('[VSN6] notifies axon listeners', () => {
      assert.deepInclude(pubsubReceivedMsgs, pubsub.USERNAME_BASED_ACCESSES_CHANGED);
    });
  });
  describe('#followedSlicesChanged', () => {
    beforeEach(() => {
      notifications.followedSlicesChanged(username);
    });

    it('[VU4A] notifies internal listeners', () => {
      assert.deepInclude(emittedMsgs, [ 'followed-slices-changed', username ]);
    });
    it('[UD2B] notifies axon listeners', () => {
      assert.deepInclude(axonMsgs, [ 'followed-slices-changed', username ]);
    });
  });
  describe('#streamsChanged', () => {
    beforeEach(() => {
      notifications.streamsChanged(username);
    });

    it('[LDUQ] notifies internal listeners', () => {
      assert.deepInclude(emittedMsgs, [ 'streams-changed', username ]);
    });
    it('[BUR1] notifies axon listeners', () => {
      assert.deepInclude(axonMsgs, [ 'streams-changed', username ]);
    });
  });
  describe('#eventsChanged', () => {
    beforeEach(() => {
      notifications.eventsChanged(username);
    });

    it('[N8RI] notifies internal listeners', () => {
      assert.deepInclude(emittedMsgs, [ 'events-changed', username ]);
    });
    it('[TRMW] notifies axon listeners', () => {
      assert.deepInclude(axonMsgs, [ 'events-changed', username ]);
    });
  });
});