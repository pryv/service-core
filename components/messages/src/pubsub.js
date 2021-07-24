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

  emit(eventName, payload) {
    deliverToNats(eventName, payload);
    super.emit(eventName, payload);
    logger.debug('emit', payload);
  }

}

// ----- NATS ------//

let initialized = false;
let natsPublisher = false;
async function init() {
  if (initialized) return;
  const config = await getConfig();
  if (! config.get('openSource:isActive')) {
    const { NatsPublisher } = require('messages');
    natsPublisher = new NatsPublisher(C.NATS_CONNECTION_URI);
  }
  initialized = true;
}

// ----- 

async function deliverToNats(eventName, message) {
  await init();
  if (natsPublisher == null) return;
  natsPublisher.deliver(eventName, message);
  loggerNats.debug('deliver', eventName, message);
} 


const pubsub = new PubSub();

Object.assign(pubsub, C);

module.exports = pubsub;

