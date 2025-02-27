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
const { decode } = JSONCodec();

const natsPubsub = require('../src/nats_pubsub');
const { getConfig } = require('@pryv/boiler');
// function decode(x) {return x};
describe('NatsPublisher', () => {
  let natsConnection;
  before(async () => {
    const natsUri = (await getConfig()).get('nats:uri');
    natsConnection = await connect({
      servers: natsUri
    });
  });
  it('[S386] should construct', async () => {
    await natsPubsub.init();
  });
  it('[I21M] delivers messages to "USERNAME"', (done) => {
    const sub = natsConnection.subscribe('foobar');
    (async () => {
      for await (const m of sub) {
        const msg = decode(m.data);
        assert.deepEqual(msg.eventName, 'onTestMessage');
        sub.unsubscribe();
        done();
      }
    })();
    natsPubsub.deliver('foobar', 'onTestMessage');
  });
});
