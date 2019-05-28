// @flow

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

  // Provides a function to apply to the channel name
  channelFormat: Function;
  
  // Connects to the NATS server on `natsUri` (in the form of
  // 'nats://nats.io:4222'). Messages that arrive here via subscriptions made 
  // (#subscribe) are sent to `sink`. 
  // 
  // @example
  // 
  //    const subscriber = new NatsSubscriber(natsUrl, sink); 
  //    await subscriber.subscribe('USERNAME')
  // 
  constructor(natsUri: string, sink: MessageSink, channelFormat?: Function) {
    this.conn = NATS.connect({
      url: natsUri, 
      'preserveBuffers': true,
    });
    this.sink = sink; 
    this.channelFormat = channelFormat || (a => {return a;});
    
    this.subscriptionUser = null; 
  }
  
  // Creates a NATS subscription for username. Channels are named after the
  // user: 'USERNAME.sok1', the postfix meaning 'socket-io', comm protocol v1. 
  // 
  async subscribe(username: string): Promise<void> {
    const conn = this.conn; 
    const channelName = this.channelFormat(username);
    const subscriptionUser = this.subscriptionUser;
    
    if (subscriptionUser != null) 
      throw new Error('Double subscription on NatsSubscriber: Currently, you can only subscribe once.');
    
    this.subscriptionUser = username; 

    const subscribed = awaiting.event(conn, 'subscribe');
    conn.subscribe(channelName, (buf) => this.dispatch(buf));
    
    // Wait until subscription is done. 
    return subscribed;
  }
  
  // Closes this NatsSubscriber's connections. This unsubscribes and closes  the
  // connection to the NATS server in particular. The instance will be useless 
  // after this. 
  // 
  close() {
    const conn = this.conn; 

    conn.close(); 
  }
  
  // Dispatches a single message received from NATS. 
  // 
  dispatch(buf: Buffer) {
    const subscriptionUser = this.subscriptionUser; 
    const sink = this.sink; 
    
    if (subscriptionUser == null) 
      throw new Error('AF: subscriptionUser may not be null here.');
    
    const msg = decode(buf);
      
    sink.deliver(subscriptionUser, msg);
  }
}

module.exports = NatsSubscriber;