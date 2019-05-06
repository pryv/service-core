// @flow

require('../test-helper');

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
    new NatsPublisher('nats://127.0.0.1:4222');
  });
  
  function connect() {
    return new NatsPublisher(
      'nats://127.0.0.1:4222');
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
      url: 'nats://127.0.0.1:4222', 
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

