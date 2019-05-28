// @flow

const NATS = require('nats');
const { encode } = require('./nats_wire_message');

import type { MessageSink } from './message_sink';

// Receives messages from ChangeNotifier and publishes them to the NATS pub/sub
// queue. 
//
class NatsPublisher implements MessageSink {
  conn: NATS.Client;
  channelFormat: Function;
  
  // Connects to the NATS server on `natsUri` (in the form of
  // 'nats://nats.io:4222') 
  //
  constructor(natsUri: string, channelFormat?: Function) {
    this.conn = NATS.connect({
      url: natsUri, 
      'preserveBuffers': true,
    });
    this.channelFormat = channelFormat || (a => {return a;});
  }

  // Delivers a message to the subject 'USERNAME.sok1'. 
  //
  deliver(userName: string, message: string): void {
    const subject = this.channelFormat(userName);
    const wireMsg = this.serialize(message);
    
    this.conn.publish(subject, wireMsg);
  }
  
  serialize(msg: string): Buffer {
    return encode(msg);
  }
}

module.exports = NatsPublisher;