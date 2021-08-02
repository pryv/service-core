/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const EventEmitter = require('events');
const { getConfig,  getLogger } = require('@pryv/boiler');
const logger = getLogger('messages:pubsub');
const C = require('./constants');

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
      useNats: false,
      forwardToTests: false
    }, options);
    
    this.scopeName = scopeName;
    this.logger = logger.getLogger(this.scopeName);
    this.initalized = false;
    this.initializing = false;
    this.testNotifier = globalTestNotifier;
    this.nats = null;
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
    if (this.options.useNats && this.nats != null)
      this.nats.deliverToNats(this.scopeName, {eventName: eventName, payload: payload});

    if (this.options.forwardToTests)
      deliverToTests(eventName, payload);

    super.emit(eventName, payload); // forward to internal listener
    logger.debug('emit', payload);
  }

  _emit(eventName, payload) {
    super.emit(eventName, payload); // forward to internal listener
    logger.debug('_emit', eventName, payload);
  }

  async init() {
    if (this.initalized) return; 
    while (this.initializing) { await new Promise(r => setTimeout(r, 50));}
    if (this.initalized) return; 
    this.initializing = true;
    const config = await getConfig();
    if (! config.get('openSource:isActive') && this.options.useNats) {
      this.nats = require('./nats_pubsub');
      await this.nats.init();
      await this.nats.subscribe(this.scopeName, this);
    }
    this.initalized = true;
    this.initializing = false;
  }

}


// ----- TEST Messaging

const testMessageMap = {};
testMessageMap[C.USERNAME_BASED_EVENTS_CHANGED] = 'axon-events-changed';
testMessageMap[C.USERNAME_BASED_STREAMS_CHANGED] = 'axon-streams-changed';
testMessageMap[C.USERNAME_BASED_FOLLOWEDSLICES_CHANGED] = 'axon-followed-slices-changed';
testMessageMap[C.USERNAME_BASED_ACCESSES_CHANGED] = 'axon-accesses-changed';
testMessageMap[C.USERNAME_BASED_ACCOUNT_CHANGED] = 'axon-account-changed';

let globalTestNotifier = null;
function setTestNotifier(testNotifier) {
  globalTestNotifier = testNotifier;
}

function deliverToTests(testNotifier, eventName, payload) {
  if (eventName == C.SERVER_READY) {
    return globalTestNotifier.emit('axon-server-ready');
  }
  const testMessageKey = testMessageMap[payload];
  if (testMessageKey) {
    globalTestNotifier.emit(testMessageKey, eventName);
  }
}

// ---- Exports

const pubsub = {
  webhooks: new PubSub('webhooks'),
  series: new PubSub('series'),
  notifications: new PubSub('notifcations', {forwardToTests: true}),
  cache: new PubSub('cache'),
  setTestNotifier,
}

pubsub.init = async function init() {
  await pubsub.webhooks.init();
  await pubsub.notifications.init();
  await pubsub.cache.init();
}

module.exports = pubsub;

