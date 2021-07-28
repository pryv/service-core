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
  
  // Construct a notifications instance. Normally called by the application 
  // start; one per process. 
  // 
  constructor(axonSocket: EventEmitter) {
    
    if (axonSocket == null)
      throw new Error('AF: axonSocket cannot be null');
    
    const pubsub = require('messages').pubsub;
    pubsub.setTestNotifier(axonSocket);
  }

}

module.exports = Notifications;

