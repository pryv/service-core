/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

// nats publisher / subscriber

const { connect, JSONCodec } = require('nats');
const { encode, decode } = JSONCodec();
const { getConfig, getLogger } = require('@pryv/boiler');
const logger = getLogger('messages:pubsub:nats');

// Might be set pubsub-setTestNatsDeliverHook() for testing purposes
let testDeliverHook = null;

let natsConnection = null;
async function init () {
  if (natsConnection != null) return;
  const natsUri = (await getConfig()).get('nats:uri');
  natsConnection = await connect({ servers: natsUri, noEcho: true });
}

async function deliver (scopeName, eventName, payload) {
  await init();
  if (testDeliverHook != null) testDeliverHook(scopeName, eventName, payload);
  logger.debug('deliver', scopeName, eventName, payload);
  if (payload == null) payload = ''; // nats does not support null messages
  if (natsConnection == null) return;
  natsConnection.publish(scopeName, encode({ eventName, payload }));
}

async function subscribe (scopeName, pubsub) {
  await init();
  logger.debug('subscribe', scopeName);
  const sub = natsConnection.subscribe(scopeName);
  (async () => {
    for await (const m of sub) {
      const msg = decode(m.data);
      logger.debug('received', scopeName, msg);
      if (msg.eventName == null) {
        console.log('Received wrong message ', pubsub, msg);
        return;
      }
      pubsub._emit(msg.eventName, msg.payload);
    }
  })();
  return sub;
}

function setTestNatsDeliverHook (deliverHook) {
  testDeliverHook = deliverHook;
}

module.exports = {
  init,
  deliver,
  subscribe,
  setTestNatsDeliverHook
};
