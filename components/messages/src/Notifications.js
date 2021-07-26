/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const EventEmitter = require('events');

// Notifications class distributes notifications inside the current process and
// via NATS server to the other api-server processes. Notifications are also
// sent to the axon PUB socket; this is mostly used by the tests. 
// 
class Notifications extends EventEmitter {
  axonSocket: EventEmitter; 
  pubsub: EventEmitter;
  
  // Construct a notifications instance. Normally called by the application 
  // start; one per process. 
  // 
  constructor(axonSocket: EventEmitter) {
    super();
    
    if (axonSocket == null)
      throw new Error('AF: axonSocket cannot be null');
    
    this.axonSocket = axonSocket;
    this.pubsub = require('messages').pubsub;
  }
  
  serverReady() {
    console.log('notifcation >> serverReady');
    this.dispatch(this.pubsub.SERVER_READY);
    this.pubsub.emit(this.pubsub.SERVER_READY);
  }
  accountChanged(userName: string) {
    this.dispatch('account-changed', userName);
    this.pubsub.emit(userName, 'account-changed');
  }
  accessesChanged(userName: string) {
    console.log('notifcation >> accessesChanged', userName);
    this.pubsub.emit(userName, this.pubsub.USERNAME_BASED_ACCESSES_CHANGED);
  }
  followedSlicesChanged(userName: string) {
    this.dispatch('followed-slices-changed', userName);
    this.pubsub.emit(userName, 'followed-slices-changed');
  }
  streamsChanged(userName: string) {
    this.dispatch('streams-changed', userName);
    this.pubsub.emit(userName, 'streams-changed');
  }
  eventsChanged(userName: string) {
    this.dispatch('events-changed', userName);
    this.pubsub.emit(userName, 'events-changed');
  }
  
  // Send the given `msg` to both internal and external listeners. This is an 
  // internal API, you probably want to use one of the other methods here. 
  //
  dispatch(msg: string, ...msgParts: Array<mixed>) {
    // Send the message to all listeners in-process
    this.emit(msg, ...msgParts);
    
    // And to all listeners on the axon PUB socket
    this.axonSocket.emit(msg, ...msgParts);
  }
}

module.exports = Notifications;

