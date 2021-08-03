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


const { pubsub } = require('messages');

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
  
  
  before(async () => {
     // intercept internal events
    pubsub.status.on(pubsub.SERVER_READY, (message) => {
      emittedMsgs.push(pubsub.SERVER_READY);
    });

    pubsub.notifications.on('USERNAME', (message) => {
      emittedMsgs.push(message);
    });

    // attach "fake" axonSocket to pubsub.
    pubsub.setTestNotifier(axonSocket); 
  });
 
  
  describe('#serverReady', () => {
    beforeEach(() => {
      pubsub.status.emit(pubsub.SERVER_READY);
    });

    it('[B76G] notifies internal listeners', () => {
      assert.deepInclude(emittedMsgs, pubsub.SERVER_READY);
    });
    it('[SRAU] notifies axon listeners', () => {
      assert.deepInclude(axonMsgs, ['axon-server-ready']);
    });
  });
  describe('#accountChanged', () => {
    beforeEach(() => {
      pubsub.notifications.emit('USERNAME', pubsub.USERNAME_BASED_ACCOUNT_CHANGED);
    });

    it('[P6ZD] notifies internal listeners', () => {
      assert.deepInclude(emittedMsgs, pubsub.USERNAME_BASED_ACCOUNT_CHANGED);
    });
    it('[Q96S] notifies axon listeners', () => {
      assert.deepInclude(axonMsgs, [ 'axon-account-changed', 'USERNAME' ]);
    });
  });
  describe('#accessesChanged', () => {
    beforeEach(() => {
      pubsub.notifications.emit('USERNAME', pubsub.USERNAME_BASED_ACCESSES_CHANGED);
    });

    it('[P5CG] notifies internal listeners', () => {
      assert.deepInclude(emittedMsgs, pubsub.USERNAME_BASED_ACCESSES_CHANGED);
    });
    it('[VSN6] notifies axon listeners', () => {
      assert.deepInclude(axonMsgs, [ 'axon-accesses-changed', 'USERNAME' ]);
    });
  });
  describe('#followedSlicesChanged', () => {
    beforeEach(() => {
      pubsub.notifications.emit('USERNAME', pubsub.USERNAME_BASED_FOLLOWEDSLICES_CHANGED);
    });

    it('[VU4A] notifies internal listeners', () => {
      assert.deepInclude(emittedMsgs, pubsub.USERNAME_BASED_FOLLOWEDSLICES_CHANGED);
    });
    it('[UD2B] notifies axon listeners', () => {
      assert.deepInclude(axonMsgs, [ 'axon-followed-slices-changed', 'USERNAME' ]);
    });
  });
  describe('#streamsChanged', () => {
    beforeEach(() => {
      pubsub.notifications.emit('USERNAME', pubsub.USERNAME_BASED_STREAMS_CHANGED);
    });

    it('[LDUQ] notifies internal listeners', () => {
      assert.deepInclude(emittedMsgs, pubsub.USERNAME_BASED_STREAMS_CHANGED);
    });
    it('[BUR1] notifies axon listeners', () => {
      assert.deepInclude(axonMsgs, [ 'axon-streams-changed', 'USERNAME' ]);
    });
  });
  describe('#eventsChanged', () => {
    beforeEach(() => {
      pubsub.notifications.emit('USERNAME', pubsub.USERNAME_BASED_EVENTS_CHANGED);
    });

    it('[N8RI] notifies internal listeners', () => {
      assert.deepInclude(emittedMsgs, pubsub.USERNAME_BASED_EVENTS_CHANGED);
    });
    it('[TRMW] notifies axon listeners', () => {
      assert.deepInclude(axonMsgs, [ 'axon-events-changed', 'USERNAME' ]);
    });
  });
});