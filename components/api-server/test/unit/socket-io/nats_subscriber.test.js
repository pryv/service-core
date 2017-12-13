// @flow

require('../test-helper');

const chai = require('chai');
const assert = chai.assert;

const NATS = require('nats');

/* global describe, it */

const { ConditionVariable } = require('../../helpers/condition_variable');

const NatsSubscriber = require('../../../src/socket-io/nats_subscriber');
const { encode } = require('../../../src/socket-io/nats_wire_message');

import type { MessageSink } from '../../../src/socket-io/message_sink';

describe('NatsSubscriber', () => {
  it('should construct', () => {
    // For this to work, you must run the 'gnatsd' service on localhost. 
    new NatsSubscriber('nats://127.0.0.1:4222', new ArraySink());
  });
  
  async function subscriber(username: string, sink: MessageSink) {
    const sub = new NatsSubscriber('nats://127.0.0.1:4222', sink);
    
    await sub.subscribe(username);
    
    return sub; 
  }
  
  it('accepts messages from USERNAME.sok1 and dispatches them to sinks', async () => {
    const arySink = new ArraySink(); 
    await subscriber('foobar', arySink);

    const rawClient = NATS.connect({
      url: 'nats://127.0.0.1:4222', 
      'preserveBuffers': true 
    });
    rawClient.publish('foobar.sok1', encode('onTestMessage'));
    
    if (arySink.msgs.length == 0)
      await arySink.cvNewMessage.wait(1000);
    
    assert.deepEqual(arySink.msgs, ['onTestMessage']);
  });
  it('ignores messages from other users', async () => {
    const arySink = new ArraySink(); 
    await subscriber('foobar', arySink);

    const rawClient = NATS.connect({
      url: 'nats://127.0.0.1:4222', 
      'preserveBuffers': true 
    });
    rawClient.publish('barbaz.sok1', encode('onTestMessage1'));
    rawClient.publish('foobar.sok1', encode('onTestMessage2'));
    
    if (arySink.msgs.length == 0)
      await arySink.cvNewMessage.wait(1000);

    // We've received the second message and not the first. Apart from waiting
    // a long time for the first _not_ to arrive, this is the best assertion we
    // will get. 
    assert.deepEqual(arySink.msgs, ['onTestMessage2']);
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