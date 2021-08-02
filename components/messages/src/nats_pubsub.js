

// nats publisher / subscriber 

const awaiting = require('awaiting');
const NATS = require('nats');
const { encode } = require('./nats_wire_message');
const { getConfig,  getLogger } = require('@pryv/boiler');
const logger = getLogger('messages:pubsub:nats');

let natsConnection = null;
async function init() {
  const natsUri = (await getConfig()).get('nats:uri');
  NATS.connect({url: natsUri, 'preserveBuffers': true});
}

function deliver(scopeName, eventName, payload) {
  if (payload == null) payload = ''; // nats does not support null messages
  if (natsConnection == null) return;
  natsConnection.publish(scopeName, encode({eventName: eventName, payload: payload}));
  logger.debug('deliver', eventName, message);
}

async function subscribe(scopeName, pubsub) {
  const subscribed = awaiting.event(conn, 'subscribe');
  natsConnection.subscribe(channelName, (buf) => { 
    const msg = decode(buf);
    if (msg.eventName == null) {
      console.log('Recieved wrong message ', pubsub, msg);
      return;
    }
    pubsub._emit(msg.eventName, msg.payload);
  });
  // Wait until subscription is done. 
  return subscribed;
}

module.exports = {
  init,
  deliver,
  subscribe
}