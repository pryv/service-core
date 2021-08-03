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
  nats; 
  scopeName;
  logger;
  natsKeySidMap; // map that contains subscriptions IDs to Map

  constructor(scopeName, options = {}) {
    super();
    this.options = Object.assign({
      nats: CONSTANTS.NATS_MODE_ALL,
      forwardToTests: false
    }, options);
    
    this.scopeName = scopeName;
    this.logger = logger.getLogger(this.scopeName);
    this.natsKeySidMap = {};
    
    if (! isOpenSource && (this.options.nats != CONSTANTS.NATS_MODE_NONE)) {
      this.nats = require('./nats_pubsub');
      if (this.options.nats == CONSTANTS.NATS_MODE_ALL) {
        this.nats.subscribe(this.scopeName, this);
      }
    } else {
      this.nats = null;
    }
  }

  on() {
    if ((this.nats != null) && (this.options.nats == CONSTANTS.NATS_MODE_KEY)) {
      const key = arguments[0];
      if (this.natsKeySidMap[key] != null) throw new Error('Cannot subscribe twice to the same key ' + key );

      this.nats.subscribe(this.scopeName + '.' + key, this).then((sid) => {
        this.natsKeySidMap[key] = sid;
      });
    }
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
      if ((this.nats != null) && (this.options.nats == CONSTANTS.NATS_MODE_KEY) && (this.natsKeySidMap[eventName] != null)) {
        this.logger.debug('off', eventName, this.natsKeySidMap[eventName]);
        this.nats.unsubscribe(this.natsKeySidMap[eventName]);
        delete this.natsKeySidMap[eventName];
      }
    }.bind(this);
  }

  emit(eventName, payload) {
    super.emit(eventName, payload); // forward to internal listener 
    this.logger.debug('emit', eventName, payload, this.options, {natsIsDefined: (this.nats != null)});
    
    if (this.options.forwardToTests)
      forwardToTests(eventName, payload);

    if (this.nats != null) {
      if (this.options.nats == CONSTANTS.NATS_MODE_ALL) this.nats.deliver(this.scopeName, eventName, payload);
      if (this.options.nats == CONSTANTS.NATS_MODE_KEY) this.nats.deliver(this.scopeName + '.' + eventName, eventName, payload); 
    }
  }

  _emit(eventName, payload) {
    super.emit(eventName, payload); // forward to internal listener
    this.logger.debug('_emit', eventName, payload);
  }

  async init() {
    console.log('Depcreated !!!!');
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
  notifications: new PubSub('notifications', {nats: CONSTANTS.NATS_MODE_KEY, forwardToTests: true}),
  cache: new PubSub('cache', {nats: CONSTANTS.NATS_MODE_KEY}),
  setTestNotifier,
}

Object.assign(pubsub, CONSTANTS);

module.exports = pubsub;

