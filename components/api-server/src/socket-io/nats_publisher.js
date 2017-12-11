// @flow

const NATS = require('nats');
const { encode } = require('./nats_wire_message');

import type { MessageSink } from './sink_collection';

// Receives messages from ChangeNotifier and publishes them to the NATS pub/sub
// queue. 
//
class NatsPublisher implements MessageSink {
  conn: NATS.Client;
  
  // Connects to the NATS server on `natsUri` (in the form of
  // 'nats://nats.io:4222') 
  //
  constructor(natsUri: string) {
    this.conn = NATS.connect({
      url: natsUri, 
      'preserveBuffers': true,
    });
  }

  // Delivers a message to the subject 'USERNAME.sok1'. 
  //
  deliver(userName: string, message: string): void {
    const subject = this.subjectForUserName(userName);
    const wireMsg = this.serialize(message);
    
    this.conn.publish(subject, wireMsg);
  }
  
  subjectForUserName(userName: string): string {
    return `${userName}.sok1`; 
  }
  serialize(msg: string): Buffer {
    return encode(msg);
  }
}

module.exports = NatsPublisher;