/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

// @flow

import type { MessageSink }  from 'messages';

type User = { username: string };

// Translation from Notifications bus messages ('events-changed') to socket.IO
// messages ('eventsChanged') happens here. Translated messages are sent to 
// the sink registered while constructing this class. 
//
class ChangeNotifier {
  sink: MessageSink; 
  
  // Constructs a change notifier; messages flow from `source` (Notifications 
  // bus) to the `sink`. 
  // 
  constructor(sink: MessageSink, name) {
    this.sink = sink; 
    this.name = name;
  }
  
  // Listens to messages that are of interest to us and forward them to 
  // #extractAndDeliver.
  //
  listenTo(source: EventEmitter) {
    const messageMap = [
      ['accesses-changed', 'accessesChanged'],
      ['events-changed', 'eventsChanged'],
      ['streams-changed', 'streamsChanged'],
    ];
    
    for (const [from, to] of messageMap) {
      source.on(from, 
        (username) => this.extractAndDeliver(to, username));
    }
  }
  
  // Extracts information from the user object and #delivers the message. 
  // 
  extractAndDeliver(message: string, username: string) {
    console.log('extractAndDeliver [' + this.name + '] ', message, username);
    const sink = this.sink; 
    sink.deliver(username, message);
  }
}
module.exports = ChangeNotifier;
