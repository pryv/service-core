/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow
require('test-helpers/src/api-server-tests-config');
require('api-server/test/unit/test-helper');

const chai = require('chai');
const assert = chai.assert;

const bluebird = require('bluebird');
const NATS = require('nats');

/* global describe, it */

const natsPubsub = require('../src/nats_pubsub');
const { decode } = require('messages/src/nats_wire_message');
const { getConfig } = require('@pryv/boiler');

describe('NatsPublisher', () => {
  let rawClient;

  before(async () => {
    const natsUri = (await getConfig()).get('nats:uri');
     rawClient = NATS.connect({
     url: natsUri, 
      'preserveBuffers': true 
    });
  });

  it('[S386] should construct', async () => {                       
    await natsPubsub.init();
  });
  
  
  it('[I21M] delivers messages to "USERNAME"', (done) => {

    
    
    const sid = rawClient.subscribe('foobar', (buf) => {
      try {
        rawClient.unsubscribe(sid);
        const msg = decode(buf);
        assert.deepEqual(msg.eventName, 'onTestMessage');
        
        done(); 
      } catch(err) { 
        done(err); 
      }
    });
    
    natsPubsub.deliver('foobar', 'onTestMessage');

    // If this test times out, then message delivery doesn't work. 
  });




});

