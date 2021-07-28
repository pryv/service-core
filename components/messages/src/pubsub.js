/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const EventEmitter = require('events');
const { getConfig,  getLogger } = require('@pryv/boiler');
const logger = getLogger('messages:pubsub');
const loggerNats = logger.getLogger('nats');
const C = require('./constants');

// Generic implementation of pub / sub messaging

class PubSub extends EventEmitter {

  constructor() {
    super();
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
    this.on(eventName, listener);
    return function() {
      this.off(eventName, listener);
    }.bind(this);
  }

  emit(eventName, payload) {
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

  getTestNotifier() {
    return this.testNotifier;
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

// ----- TEST

function deliverToTests(testNotifier, eventName, payload) {
  if (payload === C.USERNAME_BASED_EVENTS_CHANGED) {
    testNotifier.emit('axon-events-changed', eventName);
  }
  if (payload === C.USERNAME_BASED_STREAMS_CHANGED) {
    testNotifier.emit('axon-streams-changed', eventName);
  }
  if (payload === C.USERNAME_BASED_FOLLOWEDSLICES_CHANGED) {
    testNotifier.emit('axon-followed-slices-changed', eventName);
  }
  if (payload == C.USERNAME_BASED_ACCESSES_CHANGED) {
    testNotifier.emit('axon-accesses-changed', eventName);
  }
  if (payload == C.USERNAME_BASED_ACCOUNT_CHANGED) {
    testNotifier.emit('axon-account-changed', eventName);
  }
  if (eventName == C.SERVER_READY) {
    testNotifier.emit('axon-server-ready');
  }
}



module.exports = pubsub;

