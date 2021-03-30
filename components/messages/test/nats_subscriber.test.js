/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow
require('test-helpers/src/api-server-tests-config');
require('api-server/test/unit/test-helper');
const NATS_CONNECTION_URI = require('messages').NATS_CONNECTION_URI;

const chai = require('chai');
const assert = chai.assert;

const NATS = require('nats');

/* global describe, it, beforeEach, afterEach */

const { ConditionVariable } = require('test-helpers').syncPrimitives;

const { NatsSubscriber } = require('messages');
const { encode } = require('messages/src/nats_wire_message');

import type { MessageSink } from 'messages';

describe('NatsSubscriber', () => {
  it('[DMMP] should construct', () => {
    // For this to work, you must run the 'gnatsd' service on localhost. 
    new NatsSubscriber(NATS_CONNECTION_URI, new ArraySink(), 
      (username) => { return `${username}.sok1`; }
    );
  });
  
  async function subscriber(username: string, sink: MessageSink): Promise<NatsSubscriber> {
    const sub = new NatsSubscriber(NATS_CONNECTION_URI, sink,
      (username) => { return `${username}.sok1`; }
    );
    
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
        url: NATS_CONNECTION_URI, 
        'preserveBuffers': true 
      });
    });
    
    afterEach(() => {
      rawClient.close();
    });
    
    describe('subscribe("USERNAME")', () => {
      it('[4MAI] accepts messages from USERNAME.sok1 and dispatches them to sinks', async () => {
        rawClient.publish('foobar.sok1', encode('onTestMessage'));
        
        await arySink.notEmpty();
        
        assert.deepEqual(arySink.msgs, ['onTestMessage']);
      });
      it('[47BP] ignores messages from other users', async () => {
        rawClient.publish('barbaz.sok1', encode('onTestMessage1'));
        rawClient.publish('foobar.sok1', encode('onTestMessage2'));
        
        await arySink.notEmpty();

        // We've received the second message and not the first. Apart from waiting
        // a long time for the first _not_ to arrive, this is the best assertion we
        // will get. 
        assert.deepEqual(arySink.msgs, ['onTestMessage2']);
      });
    });
    describe('unsubscribe()', function () {
      this.timeout(1000);
      it('[L49E] should unsubscribe from NATS', async () => {
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
  
  deliver(userName: string, message: string | {}): void {
    if (typeof message === 'object') {
      message = JSON.stringify(message);
    }
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