/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const cache = require('cache');
const synchro = require('../../src/synchro');
const MESSAGES = synchro.MESSAGES;
const { pubsub } = require('messages');
const { getConfig } = require('@pryv/boiler');

const { connect, JSONCodec } = require('nats');
const { encode, decode } = JSONCodec();

describe('Synchro', function () {

  let natsClient;

  before(async function () {
    const config = await getConfig();
    if (config.get('openSource:isActive')) this.skip();

    const natsUri = config.get('nats:uri');
    natsClient = await connect({
      servers: natsUri, 
      json: true 
    });
  });

  beforeEach(() => {
    // empty eventual listener list
    for (let userId of synchro.listenerMap.keys()) {
      synchro.removeListenerForUserId(userId)
    }
  });

  async function sleepMs(timeMs) {
    return new Promise(r => setTimeout(r, timeMs))
  }

  it('[LHGV] Should register listener on userId when using setStreams', () => { 
    cache.setStreams('toto', 'test', 'titi');
    assert.isTrue(synchro.listenerMap.has('toto'), 'should be registered');
  });

  it('[RYQD] Should register listener on userId when using setAccessLogic.', () => { 
    cache.setAccessLogic('toto', {id: 'test', token: 'titi'});
    assert.isTrue(synchro.listenerMap.has('toto'), 'should be registered');
  });
  
  it('[R7I6] Should unset access Logic on unset Message', async () => { 
    cache.setAccessLogic('toto', {id: 'test', token: 'titi'});
    const al = cache.getAccessLogicForId('toto', 'test');
    assert.exists(al);
    assert.equal(al.token, 'titi');
    await sleepMs(50);
    natsClient.publish('cache.toto', encode({eventName: 'toto', payload: {action: MESSAGES.UNSET_ACCESS_LOGIC, accessId: 'test', accessToken: 'titi'}}));
    await sleepMs(50);
    assert.notExists(cache.getAccessLogicForId('toto', 'test'));
  });

  it('[8M1B] Registered listener should be removed on clearEvent', async () => {
    cache.setStreams('toto-id', 'test', 'titi');
    assert.isTrue(synchro.listenerMap.has('toto-id'), 'should be registered');
    cache.unsetUserData('toto-id');
    assert.isFalse(synchro.listenerMap.has('toto-id'), 'should be removed');
  });


  it('[KF7E] Registered listener should be removed on unsetUser', async () => {
    cache.setUserId('toto', 'toto-id')
    cache.setStreams('toto-id', 'test', 'titi');
    assert.isTrue(synchro.listenerMap.has('toto-id'), 'should be registered');
    cache.unsetUser('toto');
    assert.isFalse(synchro.listenerMap.has('toto-id'), 'should be removed');
  });

  it('[OKHQ] Listeners should not receive "internal" messages', async () => {
    cache.setUserId('toto', 'toto-id')
    cache.setStreams('toto-id', 'test', 'titi');
    assert.isTrue(synchro.listenerMap.has('toto-id'), 'should be registered');
    await sleepMs(50);
    pubsub.cache.emit('toto', { action: MESSAGES.UNSET_USER_DATA, });
    await sleepMs(50);
    assert.isTrue(synchro.listenerMap.has('toto-id'), 'should not be removed');
  });

  it('[Y5GA] Listeners should receive "nats" messages', async () => {
    cache.setUserId('toto', 'toto-id')
    cache.setStreams('toto-id', 'test', 'titi');
    assert.isTrue(synchro.listenerMap.has('toto-id'), 'should be registered');
    await sleepMs(50);
    natsClient.publish('cache.toto-id', encode({eventName: 'toto-id', payload: {action: MESSAGES.UNSET_USER_DATA}}));
    await sleepMs(50);
    assert.isFalse(synchro.listenerMap.has('toto-id'), 'should be removed');
  });

});