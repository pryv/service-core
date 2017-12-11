// @flow

require('../test-helper');

const chai = require('chai');
const assert = chai.assert;

const bluebird = require('bluebird');
const NATS = require('nats');

/* global describe, it */

const { ConditionVariable } = require('../../helpers/condition_variable');

const NatsSubscriber = require('../../../src/socket-io/nats_subscriber');
const { encode } = require('../../../src/socket-io/nats_wire_message');

import type { MessageSink } from '../../../src/socket-io/sink_collection';

describe('NatsSubscriber', () => {
  it('should construct', () => {
    // For this to work, you must run the 'gnatsd' service on localhost. 
    new NatsSubscriber('nats://127.0.0.1:4222', 'foobar', new ArraySink());
  });
  
  function subscriber(username: string, sink: MessageSink) {
    return new NatsSubscriber('nats://127.0.0.1:4222', username, sink);
  }
  
  it('accepts messages from USERNAME.sok1 and dispatches them to sinks', async () => {
    const arySink = new ArraySink(); 
    subscriber('foobar', arySink);

    const rawClient = NATS.connect({
      url: 'nats://127.0.0.1:4222', 
      'preserveBuffers': true 
    });
    rawClient.publish('foobar.sok1', encode('onTestMessage'));
    
    if (arySink.msgs.length == 0)
      await arySink.cvNewMessage.wait(1000);
    
    assert.deepEqual(arySink.msgs, ['onTestMessage']);
  });
  it.skip('ignores messages from other users', () => {
    
  });
});

class ArraySink implements MessageSink {
  // Messages that were delivered to this sink. 
  msgs: Array<string>; 
  
  // Broadcasted to when a new message arrives.
  cvNewMessage: ConditionVariable;
  
  constructor() {
    this.msgs = []; 
    this.cvNewMessage = new ConditionVariable(); 
  }
  
  deliver(userName: string, message: string): void {
    this.msgs.push(message);
    this.cvNewMessage.broadcast(); 
  }
}