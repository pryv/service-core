/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow
// Notifications class distributes notifications inside the current process and
// via NATS server to the other api-server processes. Notifications are also
// sent to the axon PUB socket; this is mostly used by the tests. 
// 
class Notifications {
  axonSocket: EventEmitter; 
  pubsub: {};
  
  // Construct a notifications instance. Normally called by the application 
  // start; one per process. 
  // 
  constructor(axonSocket: EventEmitter) {
    
    if (axonSocket == null)
      throw new Error('AF: axonSocket cannot be null');
    
    this.axonSocket = axonSocket;
    this.pubsub = require('messages').pubsub;
  }
  
  serverReady() {
    this.axonPublish('axon-server-ready');
    this.pubsub.emit(this.pubsub.SERVER_READY);
  }
  accountChanged(userName: string) {
    this.axonPublish('axon-account-changed', userName);
    this.pubsub.emit(userName, this.pubsub.USERNAME_BASED_ACCOUNT_CHANGED);
  }
  accessesChanged(userName: string) {
    this.axonPublish('axon-accesses-changed', userName);
    this.pubsub.emit(userName, this.pubsub.USERNAME_BASED_ACCESSES_CHANGED);
  }
  followedSlicesChanged(userName: string) {
    this.axonPublish('axon-followed-slices-changed', userName);
    this.pubsub.emit(userName, this.pubsub.USERNAME_BASED_FOLLOWEDSLICES_CHANGED);
  }
  streamsChanged(userName: string) {
    this.axonPublish('axon-streams-changed', userName);
    this.pubsub.emit(userName, this.pubsub.USERNAME_BASED_STREAMS_CHANGED);
  }
  eventsChanged(userName: string) {
    this.axonPublish('axon-events-changed', userName);
    this.pubsub.emit(userName, this.pubsub.USERNAME_BASED_EVENTS_CHANGED);
  }
  
  // Send the given `msg` to both internal and external listeners. This is an 
  // internal API, you probably want to use one of the other methods here. 
  //
  axonPublish(msg: string, ...msgParts: Array<mixed>) {
    this.axonSocket.emit(msg, ...msgParts);
  }
}





module.exports = Notifications;

