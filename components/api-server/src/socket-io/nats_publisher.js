/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const NATS = require('nats');
const { encode } = require('./nats_wire_message');

import type { MessageSink }  from './message_sink';

// Receives messages from ChangeNotifier and publishes them to the NATS pub/sub
// queue. 
//
class NatsPublisher implements MessageSink {
  conn: NATS.Client;

  // Provides a function to apply to the channel name
  channelFormat: (string) => string;
  
  // Connects to the NATS server on `natsUri` (in the form of
  // 'nats://nats.io:4222') 
  //
  constructor(natsUri: string, channelFormat?: (string) => string) {
    this.conn = NATS.connect({
      url: natsUri, 
      'preserveBuffers': true,
    });
    this.channelFormat = channelFormat || (a => {return a;});
  }

  // Delivers a message to the subject 'USERNAME.sok1'. 
  //
  deliver(userName: string, message: string | Object): void {
    const subject = this.channelFormat(userName);
    const wireMsg = this.serialize(message);
    
    this.conn.publish(subject, wireMsg);
  }
  
  serialize(msg: string | Object): Buffer {
    return encode(msg);
  }
}

module.exports = NatsPublisher;