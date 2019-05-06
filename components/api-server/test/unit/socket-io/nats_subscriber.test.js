// @flow

require('../test-helper');

const chai = require('chai');
const assert = chai.assert;

const NATS = require('nats');

/* global describe, it, beforeEach, afterEach */

const { ConditionVariable } = require('components/test-helpers').syncPrimitives;

const NatsSubscriber = require('../../../src/socket-io/nats_subscriber');
const { encode } = require('../../../src/socket-io/nats_wire_message');

import type { MessageSink } from '../../../src/socket-io/message_sink';

describe('NatsSubscriber', () => {
  it('T49T-should construct', () => {
    // For this to work, you must run the 'gnatsd' service on localhost. 
    new NatsSubscriber('nats://127.0.0.1:4222', new ArraySink());
  });
  
  async function subscriber(username: string, sink: MessageSink): Promise<NatsSubscriber> {
    const sub = new NatsSubscriber('nats://127.0.0.1:4222', sink);
    
    await sub.subscribe(username);
    
    return sub; 
  }
  
  describe('when subscribed to "foobar"', () => {
    let natsSubscriber: NatsSubscriber;
    let arySink: ArraySink;
    
    let rawClient;
    
    // Connects NatsSubscriber to user 'foobar'
    beforeEach(async () => {
      arySink = new ArraySink(); 
      natsSubscriber = await subscriber('foobar', arySink);
    });
    // Connects rawClient to NATS
    beforeEach(() => {
      rawClient = NATS.connect({
        url: 'nats://127.0.0.1:4222', 
        'preserveBuffers': true 
      });
    });
    
    afterEach(() => {
      rawClient.close();
    });
    
    describe('subscribe("USERNAME")', () => {
      it('CCDU-accepts messages from USERNAME.sok1 and dispatches them to sinks', async () => {
        rawClient.publish('foobar.sok1', encode('onTestMessage'));
        
        await arySink.notEmpty();
        
        assert.deepEqual(arySink.msgs, ['onTestMessage']);
      });
      it('1WON-ignores messages from other users', async () => {
        rawClient.publish('barbaz.sok1', encode('onTestMessage1'));
        rawClient.publish('foobar.sok1', encode('onTestMessage2'));
        
        await arySink.notEmpty();

        // We've received the second message and not the first. Apart from waiting
        // a long time for the first _not_ to arrive, this is the best assertion we
        // will get. 
        assert.deepEqual(arySink.msgs, ['onTestMessage2']);
      });
    });
    describe('unsubscribe()', () => {
      it('09SQ-should unsubscribe from NATS', async () => {
        rawClient.publish('foobar.sok1', encode('onTestMessage1'));
        
        await arySink.notEmpty();
        
        await natsSubscriber.close(); 
        
        rawClient.publish('foobar.sok1', encode('onTestMessage2'));

        // We've received the second message and not the first. Apart from waiting
        // a long time for the first _not_ to arrive, this is the best assertion we
        // will get. 
        assert.deepEqual(arySink.msgs, ['onTestMessage1']);
      });
    });
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
  
  async notEmpty() {
    const msgs = this.msgs; 
    const cvNewMessage = this.cvNewMessage;
    const timeoutMs = 1000; 
    
    if (msgs.length>0) return; 
    
    await cvNewMessage.wait(timeoutMs);
  }
}