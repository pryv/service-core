/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const EventEmitter = require('events');
const { getConfigUnsafe,  getLogger } = require('@pryv/boiler');
const logger = getLogger('messages:pubsub');
const CONSTANTS = require('./constants');
const isOpenSource = getConfigUnsafe(true).get('openSource:isActive');

// Generic implementation of pub / sub messaging

class PubSub extends EventEmitter {
  options;
  testNotifier;
  nats; 
  initalized;
  initializing;
  scopeName;
  logger;

  constructor(scopeName, options = {}) {
    super();
    this.options = Object.assign({
      useNats: true,
      forwardToTests: false
    }, options);
    
    this.scopeName = scopeName;
    this.logger = logger.getLogger(this.scopeName);
    this.initalized = false;
    this.initializing = false;
    this.testNotifier = globalTestNotifier;
    
    if (! isOpenSource && this.options.useNats) {
      this.nats = require('./nats_pubsub');
    } else {
      this.nats = null;
    }
  }

  on() {
    if (! this.initalized) throw(new Error('Initialize pubsub before registering listeners'));
    super.on(...arguments);
  }

  /**
   * Add-on to EventEmmitter that returns a function to be called to 
   * @returns function
   */
  onAndGetRemovable(eventName, listener) {
    this.on(eventName, listener);
    return function() {
      this.off(eventName, listener);
    }.bind(this);
  }

  emit(eventName, payload) {
    super.emit(eventName, payload); // forward to internal listener 
    this.logger.debug('emit', eventName, payload, this.options, {natsIsDefined: (this.nats != null)});
    
    if (this.options.forwardToTests)
      forwardToTests(eventName, payload);

    if (this.nats != null) {
      this.nats.deliver(this.scopeName, eventName, payload);
    }
  }

  _emit(eventName, payload) {
    super.emit(eventName, payload); // forward to internal listener
    this.logger.debug('_emit', eventName, payload);
  }

  async init() {
    if (this.initalized) return; 
    while (this.initializing) { await new Promise(r => setTimeout(r, 50));}
    if (this.initalized) return; 
    this.initializing = true;
    if (this.nats != null) {
      await this.nats.init();
      await this.nats.subscribe(this.scopeName, this);
    }
    this.initalized = true;
    this.initializing = false;
    this.logger.debug('Initialized');
  }

}


// ----- TEST Messaging

const testMessageMap = {};
testMessageMap[CONSTANTS.USERNAME_BASED_EVENTS_CHANGED] = 'axon-events-changed';
testMessageMap[CONSTANTS.USERNAME_BASED_STREAMS_CHANGED] = 'axon-streams-changed';
testMessageMap[CONSTANTS.USERNAME_BASED_FOLLOWEDSLICES_CHANGED] = 'axon-followed-slices-changed';
testMessageMap[CONSTANTS.USERNAME_BASED_ACCESSES_CHANGED] = 'axon-accesses-changed';
testMessageMap[CONSTANTS.USERNAME_BASED_ACCOUNT_CHANGED] = 'axon-account-changed';

let globalTestNotifier = null;
function setTestNotifier(testNotifier) {
  globalTestNotifier = testNotifier;
}

function forwardToTests(eventName, payload) {
  if (eventName == CONSTANTS.SERVER_READY) {
    
    return globalTestNotifier.emit('axon-server-ready');
  }
  const testMessageKey = testMessageMap[payload];
  if (testMessageKey) {
    globalTestNotifier.emit(testMessageKey, eventName);
  }
}

// ---- Exports

const pubsub = {
  status: new PubSub('status', {forwardToTests: true}),
  webhooks: new PubSub('webhooks'),
  series: new PubSub('series'),
  notifications: new PubSub('notifications', {forwardToTests: true}),
  cache: new PubSub('cache'),
  setTestNotifier,
}

Object.assign(pubsub, CONSTANTS);

module.exports = pubsub;

