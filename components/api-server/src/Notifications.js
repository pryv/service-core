/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const { getConfig, getLogger } = require('@pryv/boiler');
const EventEmitter = require('events');
const utils = require('utils');
const bluebird = require('bluebird');

// Notifications class distributes notifications inside the current process and
// via NATS server to the other api-server processes. Notifications are also
// sent to the axon PUB socket; this is mostly used by the tests. 
// 
class Notifications extends EventEmitter {
  eventEmitter: EventEmitter; 
  
  // Construct a notifications instance. Normally called by the application 
  // start; one per process. 
  // 
  constructor(eventEmitter: EventEmitter) {
    super();
    
    if (eventEmitter == null)
      throw new Error('AF: eventEmitter cannot be null');
    
    this.eventEmitter = eventEmitter;
  }
  
  serverReady() {
    this.dispatch('server-ready');
  }
  accountChanged(userName: string) {
    this.dispatch('account-changed', userName);
  }
  accessesChanged(userName: string) {
    this.dispatch('accesses-changed', userName);
  }
  followedSlicesChanged(userName: string) {
    this.dispatch('followed-slices-changed', userName);
  }
  streamsChanged(userName: string) {
    this.dispatch('streams-changed', userName);
  }
  eventsChanged(userName: string) {
    this.dispatch('events-changed', userName);
  }
  
  // Send the given `msg` to both internal and external listeners. This is an 
  // internal API, you probably want to use one of the other methods here. 
  //
  dispatch(msg: string, ...msgParts: Array<mixed>) {
    // Send the message to all listeners in-process
    this.emit(msg, ...msgParts);
    
    // And to all listeners on the eventEmitter PUB socket
    this.eventEmitter.emit(msg, ...msgParts);
  }
}


// Opens an axon PUB socket. The socket will be used for three purposes: 
//
//  a) Internal communication via events, called directly on the notifications 
//    instance. 
//  b) Communication with the tests. When ran via InstanceManager, this is 
//    used to synchronize with the tests. 
//  c) For communication with other api-server processes on the same core. 
// 
// You can turn this off! If you set 'tcpMessaging.enabled' to false, nstno axon
// messaging will be performed. This method returns a plain EventEmitter 
// instead; allowing a) and c) to work. The power of interfaces. 
// 
async function openNotificationBus() {
  const logger = getLogger('notification-bus'); 
  const config = await getConfig(); 

  const tcpMessaging = config.get('tcpMessaging');
  if (! tcpMessaging.enabled) return new EventEmitter(); 
  
  try {
    const socket = await utils.messaging.openPubSocket();
      
    logger.debug(`AXON TCP pub socket ready on ${tcpMessaging.host}:${tcpMessaging.port}`);
    logger.info(`TCP pub socket ready on ${tcpMessaging.host}:${tcpMessaging.port}`);
    return socket; 
  }
  catch (err) {
    logger.error('Error setting up TCP pub socket: ' + err);
    process.exit(1);
  }
}
  
let bus;
// Sets up `Notifications` bus and registers it for everyone to consume. 
// 
async function init() {
  if (bus) {
    throw(new Error('Bus already initialized'))
  }
  const notificationEvents = await openNotificationBus();
  bus = new Notifications(notificationEvents);
  return bus;
}

function getNotificationBusSync() {
  if (bus) return bus;
  throw(new Error('Bus not initialized'));
}

async function getNotificationBus() {
  if (bus) return bus;
  return await init();
}


module.exports = {
  init,
  getNotificationBus,
  getNotificationBusSync
};

