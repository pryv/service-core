/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const { EventEmitter2 } = require('eventemitter2');
const EventEmitter = require('events');
const { getConfig,  getLogger } = require('@pryv/boiler');
const logger = getLogger('messages:pubsub');
const loggerNats = logger.getLogger('nats');
const C = require('./constants');

// Generic implementation of pub / sub messaging

class PubSub extends EventEmitter2 {

  constructor() {
    super({wildcard: true, delimiter: '.', verboseMemoryLeak: true});
    //this.on('removeListener', (eventName, l) => { logger.debug('Removed', eventName, l)});
  }

  on() {
    if (! initalized) throw(new Error('Initialize pubsub before registering listeners'));
    super.on(...arguments);
  }

  async init() {
    return await init();
  }

  /**
   * Add-on to EventEmmitter that returns a function to be called to 
   * @returns function
   */
  onAndGetRemovable(eventName, listener) {
    console.log('XXXX onAndGetRemovable', eventName);
    this.on(eventName, listener);
    return function() {
      this.off(eventName, listener);
    }.bind(this);
  }

  emitKeyBased(definition, key, payload) {
    if (definition?.eventMask == null || definition?.eventName == null) { throw new Error('Invalid onKeybased definition ' + JSON.stringify(definition) + ' key: ' + key);}
    const eventName = definition.eventMask.replace('{key}', key);
    const newPayload = {key: key, eventName: definition.eventName, payload: payload};
    return this.emit(eventName, newPayload);
  };

  /**
   * @returns a removable function !!  
   */
  onKeyBased(definition, key, listener) {
    if (definition?.eventMask == null) { throw new Error('Invalid onKeybased definition ' + JSON.stringify(definition) + ' key: ' + key)}
    const eventName = definition.eventMask.replace('{key}', key);
    return this.onAndGetRemovable(eventName, listener);
  }

  emit(eventName, payload) {
    console.log('XXXX emit', eventName, payload);
    //deliverToNats(eventName, payload);
    deliverToNats('pubsub', {eventName: eventName, payload: payload});
    if (this.testNotifier) deliverToTests(this.testNotifier, eventName, payload)
    super.emit(eventName, payload); // forward to internal listener
    logger.debug('emit', payload);
  }

  _emit(eventName, payload) {
    super.emit(eventName, payload); // forward to internal listener
    logger.debug('_emit', eventName, payload);
  }

  setTestNotifier(testNotifier) {
    this.testNotifier = testNotifier;
  }
}

// ----- NATS ------//

let initalized = false;
let initializing = false;
let natsPublisher = null;
async function init() {
  if (initalized) return; 
  while (initializing) { await new Promise(r => setTimeout(r, 50));}
  if (initalized) return; 
  initializing = true;
  const config = await getConfig();
  if (! config.get('openSource:isActive')) {
    const { NatsPublisher, NatsSubscriber } = require('messages');
    natsPublisher = new NatsPublisher(C.NATS_CONNECTION_URI);

    const natsSubscriber = new NatsSubscriber(
      C.NATS_CONNECTION_URI, 
      { deliver: deliverFromNats}
    );
    await natsSubscriber.subscribe('pubsub');
    loggerNats.debug('Nats Initialized and ready');
  }
  initalized = true;
  initializing = false;
}

// ----- 

const pubsub = new PubSub();

Object.assign(pubsub, C);

async function deliverToNats(eventName, message) {
  if (message == null) message = ''; // nats does not support null messages
  await init();
  if (natsPublisher == null) return;
  natsPublisher.deliver(eventName, message);
  loggerNats.debug('deliver', eventName, message);
} 

async function deliverFromNats(pubsubKey, content) {
  if (pubsubKey !== 'pubsub' || content.eventName == null) {
    console.log('Recieved wrong message ', pubsub, content);
    return;
  }
  if (pubsub == null) { 
    console.log('XXXXXX PubSub not yet initalized'); 
    return; 
  }
  pubsub._emit(content.eventName, content.payload);
}

// ----- TEST Messaging

const testMessageMap = {};
testMessageMap[C.USERNAME_BASED_EVENTS_CHANGED.eventName] = 'axon-events-changed';
testMessageMap[C.USERNAME_BASED_STREAMS_CHANGED] = 'axon-streams-changed';
testMessageMap[C.USERNAME_BASED_FOLLOWEDSLICES_CHANGED] = 'axon-followed-slices-changed';
testMessageMap[C.USERNAME_BASED_ACCESSES_CHANGED] = 'axon-accesses-changed';
testMessageMap[C.USERNAME_BASED_ACCOUNT_CHANGED] = 'axon-account-changed';

function deliverToTests(testNotifier, eventName, payload) {
  if (eventName == C.SERVER_READY) {
    return testNotifier.emit('axon-server-ready');
  }
  const testMessageKey = testMessageMap[payload];
  if (testMessageKey) {
    testNotifier.emit(testMessageKey, eventName);
  }
  const testMessageKey2 = testMessageMap[payload.eventName];
  if (testMessageKey2) {
    testNotifier.emit(testMessageKey2, payload.key);
  }
}

module.exports = pubsub;

