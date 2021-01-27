/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

require('../test-helper');
const NATS_CONNECTION_URI = require('utils').messaging.NATS_CONNECTION_URI;

const chai = require('chai');
const assert = chai.assert;

const bluebird = require('bluebird');
const NATS = require('nats');

/* global describe, it */

const NatsPublisher = require('../../../src/socket-io/nats_publisher');
const { decode } = require('../../../src/socket-io/nats_wire_message');

describe('NatsPublisher', () => {
  it('[S386] should construct', () => {
    // For this to work, you must run the 'gnatsd' service on localhost. 
    new NatsPublisher(NATS_CONNECTION_URI);
  });
  
  function connect() {
    return new NatsPublisher(
      NATS_CONNECTION_URI,
      (userName) => { return `${userName}.sok1`; }
    );
  }
  function waitForConnect(natsConnection): Promise<void> {
    return new bluebird((resolve, reject) => {
      natsConnection.on('connect', resolve);
      natsConnection.on('error', reject); 
    });
  }
  
  it('[I21M] delivers messages to "USERNAME.sok1"', (done) => {
    const p = connect();
    const rawClient = NATS.connect({
      url: NATS_CONNECTION_URI, 
      'preserveBuffers': true 
    });
    
    const sid = rawClient.subscribe('foobar.sok1', (msg) => {
      try {
        rawClient.unsubscribe(sid);
        
        assert.deepEqual(decode(msg), 'onTestMessage');
        
        done(); 
      } catch(err) { 
        done(err); 
      }
    });
    
    waitForConnect(rawClient)
      .then(() => p.deliver('foobar', 'onTestMessage'))
      .catch(err => done(err));

    // If this test times out, then message delivery doesn't work. 
  });
});

