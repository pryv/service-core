/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const cache = require('cache');
const synchro = require('../../src/synchro');
const { pubsub } = require('messages');
const { getConfig } = require('@pryv/boiler');

const { connect, JSONCodec } = require('nats');
const { encode, decode } = JSONCodec();

describe('Synchro', function () {

  let natsClient;

  before(async () => {
    const natsUri = (await getConfig()).get('nats:uri');
    natsClient = await connect({
     servers: natsUri, 
     json: true 
    });
  });

  beforeEach(() => {
    // empty eventual listener list
    for (let userId of Object.keys(synchro.removableListenersMap)) {
      synchro.removeChangeTracker(userId)
    }
  });

  it('[LHGV] Should register listener on userId when using setForUserUserId', () => { 
    cache.setForUserId('toto', 'test', 'titi');
    assert.exists(synchro.removableListenersMap['toto'], 'should be registered');
  });

  it('[8M1B] Registered listener should be removed on clearEvent', () => {
    cache.setForUserId('toto', 'test', 'titi');
    assert.exists(synchro.removableListenersMap['toto'], 'should be registered');
    cache.clearUserId('toto');
    assert.notExists(synchro.removableListenersMap['toto'], 'should be removed');
  });

  it('[OKHQ] Listners should not receive "internal" messages', async () => {
    cache.setForUserId('toto', 'test', 'titi');
    assert.exists(synchro.removableListenersMap['toto'], 'should be registered');
    pubsub.cache.emit('toto', {action: 'clear'});
    await new Promise(r => setTimeout(r, 50));
    assert.exists(synchro.removableListenersMap['toto'], 'should not be removed');
  });

  it('[Y5GA] Listners should receive "nats" messages', async () => {
    cache.setForUserId('toto', 'test', 'titi');
    await new Promise(r => setTimeout(r, 50));
    natsClient.publish('cache.toto', encode({eventName: 'toto', payload: {action: 'clear'}}));
    await new Promise(r => setTimeout(r, 50));
    assert.notExists(synchro.removableListenersMap['toto'], 'should be removed');
  });

});