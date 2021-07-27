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
  const notifyTests = new Notifications(axonSocket); 
  
  before(async () => {
    await pubsub.init();
     // intercept internal events
    pubsub.on(pubsub.SERVER_READY, (message) => {
      emittedMsgs.push(pubsub.SERVER_READY);
    });

    pubsub.on('USERNAME', (message) => {
      emittedMsgs.push(message);
    });
  });
 
  
  describe('#serverReady', () => {
    beforeEach(() => {
      notifyTests.serverReady();
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
      notifyTests.accountChanged('USERNAME');
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
      notifyTests.accessesChanged('USERNAME');
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
      notifyTests.followedSlicesChanged('USERNAME');
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
      notifyTests.streamsChanged('USERNAME');
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
      notifyTests.eventsChanged('USERNAME');
    });

    it('[N8RI] notifies internal listeners', () => {
      assert.deepInclude(emittedMsgs, pubsub.USERNAME_BASED_EVENTS_CHANGED);
    });
    it('[TRMW] notifies axon listeners', () => {
      assert.deepInclude(axonMsgs, [ 'axon-events-changed', 'USERNAME' ]);
    });
  });
});