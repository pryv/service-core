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
  }

  async init() {
    return await init();
  }

  emit(eventName, payload) {
    deliverToNats(eventName, payload);
    deliverToNats('pubsub', {eventName: eventName, payload: payload});
    super.emit(eventName, payload); // forward to internal listener
    logger.debug('emit', payload);
  }

  _emit(eventName, payload) {
    super.emit(eventName, payload); // forward to internal listener
    logger.debug('_emit', eventName, payload);
  }
}

// ----- NATS ------//

let initializing = false;
let natsPublisher = null;
async function init() {
  while (initializing) { await new Promise(r => setTimeout(r, 50));}
  if (natsPublisher != null) return;
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
  initializing = false;
}

// ----- 


const pubsub = new PubSub();

Object.assign(pubsub, C);

async function deliverToNats(eventName, message) {
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
  loggerNats.error('deliverFromNats', pubsubKey, content);
  pubsub._emit(content.eventName, content.payload);
}



module.exports = pubsub;

