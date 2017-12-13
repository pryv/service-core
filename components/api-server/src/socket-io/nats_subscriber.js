// @flow

const bluebird = require('bluebird');
const awaiting = require('awaiting');
const NATS = require('nats');
const { decode } = require('./nats_wire_message');

import type { MessageSink } from './message_sink';

// Receives messages from a single NATS channel (use #subscribe) and delivers
// them to a message sink. 
//
class NatsSubscriber {
  conn: NATS.Client;
  sink: MessageSink; 
  
  // What user we subscribed to - or `null` if no subscription was made yet. 
  subscriptionUser: ?string; 
  
  // Connects to the NATS server on `natsUri` (in the form of
  // 'nats://nats.io:4222'). Messages that arrive here via subscriptions made 
  // (#subscribe) are sent to `sink`. 
  // 
  // @example
  // 
  //    const subscriber = new NatsSubscriber(natsUrl, sink); 
  //    await subscriber.subscribe('USERNAME')
  // 
  constructor(natsUri: string, sink: MessageSink) {
    this.conn = NATS.connect({
      url: natsUri, 
      'preserveBuffers': true,
    });
    this.sink = sink; 
    
    this.subscriptionUser = null; 
  }
  
  // Creates a NATS subscription for username. Channels are named after the
  // user: 'USERNAME.sok1', the postfix meaning 'socket-io', comm protocol v1. 
  // 
  async subscribe(username: string): Promise<void> {
    const conn = this.conn; 
    const channelName = channelForUser(username);
    const subscriptionUser = this.subscriptionUser;
    
    if (subscriptionUser != null) 
      throw new Error('Double subscription on NatsSubscriber: Currently, you can only subscribe once.');
    
    this.subscriptionUser = username; 

    const subscribed = awaiting.event(conn, 'subscribe');
    conn.subscribe(channelName, (buf) => this.dispatch(buf));
    
    // Wait until subscription is done. 
    return subscribed;
    
    function channelForUser(username: string): string {
      return `${username}.sok1`;
    }
  }
  
  // Dispatches a single message received from NATS. 
  // 
  dispatch(buf: Buffer) {
    const subscriptionUser = this.subscriptionUser; 
    const sink = this.sink; 
    
    if (subscriptionUser == null) 
      throw new Error('AF: subscriptionUser may not be null here.');
    
    const msg = decode(buf);
    if (typeof msg !== 'string') 
      throw new Error('AF: messages are simple strings in sok1.');
      
    sink.deliver(subscriptionUser, msg);
  }
}

module.exports = NatsSubscriber;