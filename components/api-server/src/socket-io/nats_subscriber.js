// @flow

const NATS = require('nats');
const { decode } = require('./nats_wire_message');

import type { MessageSink } from './message_sink';

// Receives messages from ChangeNotifier and publishes them to the NATS pub/sub
// queue. 
//
class NatsSubscriber {
  conn: NATS.Client;
  username: string; 
  sink: MessageSink; 
  
  // Connects to the NATS server on `natsUri` (in the form of
  // 'nats://nats.io:4222'). Accepts messages from the channel dedicated to
  // `username` and sends them onwards to `sink`. Messages that are not for
  // `username` are silently discarded. 
  // 
  constructor(natsUri: string, username: string, sink: MessageSink) {
    this.conn = NATS.connect({
      url: natsUri, 
      'preserveBuffers': true,
    });
    this.username = username; 
    this.sink = sink; 
    
    this.subscribe(username);
  }
  
  // Creates a NATS subscription for username. Channels are named after the
  // user: 'USERNAME.sok1', the postfix meaning 'socket-io', comm protocol v1. 
  // 
  subscribe(username: string) {
    const conn = this.conn; 
    const channelName = channelForUser(username);
    
    conn.subscribe(channelName, (buf) => this.dispatch(buf));
    
    function channelForUser(username: string): string {
      return `${username}.sok1`;
    }
  }
  
  // Dispatches a single message received from NATS. 
  // 
  dispatch(buf: Buffer) {
    const subscriptionUser = this.username; 
    const sink = this.sink; 
    
    const msg = decode(buf);
    if (typeof msg !== 'string') 
      throw new Error('AF: messages are simple strings in sok1.');
      
    sink.deliver(subscriptionUser, msg);
  }
}

module.exports = NatsSubscriber;