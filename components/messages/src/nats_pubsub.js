/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */


// nats publisher / subscriber 

const { connect, JSONCodec } = require('nats');
const { encode, decode } = JSONCodec();
const { getConfig, getLogger } = require('@pryv/boiler');
const logger = getLogger('messages:pubsub:nats');

let natsConnection = null;
async function init() {
  if (natsConnection != null) return;
  const natsUri = (await getConfig()).get('nats:uri');
  natsConnection = await connect({ servers: natsUri, noEcho: true });
}

async function deliver(scopeName, eventName, payload) {
  await init();
  logger.debug('deliver', scopeName, eventName, payload);
  if (payload == null) payload = ''; // nats does not support null messages
  if (natsConnection == null) return;
  natsConnection.publish(scopeName, encode({ eventName: eventName, payload: payload }));
}

async function subscribe(scopeName, pubsub) {
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

module.exports = {
  init,
  deliver,
  subscribe
}