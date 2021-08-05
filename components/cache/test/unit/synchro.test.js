const cache = require('cache');
const synchro = require('../../src/synchro');
const { pubsub } = require('messages');
const { getConfig } = require('@pryv/boiler');

const NATS = require('nats');
const { encode } = require('messages/src/nats_wire_message');

describe('Synchro', function () {

  let natsClient;

  before(async () => {
    const natsUri = (await getConfig()).get('nats:uri');
    natsClient = NATS.connect({
     url: natsUri, 
      'preserveBuffers': true 
    });
  });

  beforeEach(() => {
    // empty eventual listener list
    for (let userId of Object.keys(synchro.listenerMap)) {
      synchro.removeChangeTracker(userId)
    }
  });

  it('[LHGV] Should register listener on userId when using setForUserUserId', () => { 
    cache.setForUserId('toto', 'test', 'titi');
    assert.exists(synchro.listenerMap['toto'], 'should be registered');
  });

  it('[8M1B] Registered listener should be removed on clearEvent', () => {
    cache.setForUserId('toto', 'test', 'titi');
    assert.exists(synchro.listenerMap['toto'], 'should be registered');
    cache.clearUserId('toto');
    assert.notExists(synchro.listenerMap['toto'], 'should be removed');
  });

  it('[OKHQ] Listners should not receive "internal" messages', () => {
    cache.setForUserId('toto', 'test', 'titi');
    assert.exists(synchro.listenerMap['toto'], 'should be registered');
    pubsub.cache.emit('toto', {action: 'clear'});
    await new Promise(r => setTimeout(r, 50));
    assert.exists(synchro.listenerMap['toto'], 'should not be removed');
  });

  it('[Y5GA] Listners should receive "nats" messages', async () => {
    cache.setForUserId('toto', 'test', 'titi');
    assert.exists(synchro.listenerMap['toto'], 'should be registered');
    natsClient.publish('cache.toto', encode({eventName: 'toto', payload: {action: 'clear'}}));
    await new Promise(r => setTimeout(r, 50));
    assert.notExists(synchro.listenerMap['toto'], 'should be removed');
  });

});