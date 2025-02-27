/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

require('test-helpers/src/api-server-tests-config');
require('api-server/test/unit/test-helper');
const chai = require('chai');
const assert = chai.assert;
const { connect, JSONCodec } = require('nats');
const { encode } = JSONCodec();
const { getConfig } = require('@pryv/boiler');

const natsPubsub = require('../src/nats_pubsub');

describe('NatsSubscriber', () => {
  it('[DMMP] should construct', async () => {
    await natsPubsub.init();
  });
  async function subscriber (username, msgs) {
    const stub = {
      _emit: function (eventName, payload) {
        msgs.push(eventName);
      }
    };
    return await natsPubsub.subscribe(username, stub);
  }
  describe('when subscribed to "foobar"', () => {
    let msgs;
    let rawClient;
    let natsSUB;
    // Connects NatsSubscriber to user 'foobar'
    beforeEach(async () => {
      msgs = [];
      if (natsSUB) {
        natsSUB.unsubscribe();
      }
      natsSUB = await subscriber('foobar', msgs);
    });
    // Connects rawClient to NATS
    beforeEach(async () => {
      const natsUri = (await getConfig()).get('nats:uri');
      rawClient = await connect({
        servers: natsUri
      });
    });
    afterEach(() => {
      rawClient.close();
    });
    describe('subscribe("USERNAME")', () => {
      it('[4MAI] accepts messages from USERNAME.sok1 and dispatches them to sinks', async () => {
        await rawClient.publish('foobar', encode({ eventName: 'onTestMessage' }));
        while (msgs.length === 0) {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        assert.deepEqual(msgs, ['onTestMessage']);
      });
      it('[47BP] ignores messages from other users', async () => {
        rawClient.publish('barbaz', encode({ eventName: 'onTestMessage1' }));
        rawClient.publish('foobar', encode({ eventName: 'onTestMessage2' }));
        while (msgs.length === 0) {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        // We've received the second message and not the first. Apart from waiting
        // a long time for the first _not_ to arrive, this is the best assertion we
        // will get.
        assert.deepEqual(msgs, ['onTestMessage2']);
      });
    });
    describe('unsubscribe()', function () {
      this.timeout(1000);
      it('[L49E] should unsubscribe from NATS', async () => {
        rawClient.publish('foobar', encode({ eventName: 'onTestMessage1' }));
        while (msgs.length === 0) {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        natsSUB.unsubscribe();
        rawClient.publish('foobar', encode({ eventName: 'onTestMessage2' }));
        // We've received the second message and not the first. Apart from waiting
        // a long time for the first _not_ to arrive, this is the best assertion we
        // will get.
        assert.deepEqual(msgs, ['onTestMessage1']);
      });
    });
  });
});
