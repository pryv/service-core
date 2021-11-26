/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

// @flow

const { getLogger } = require('@pryv/boiler');
const logger = getLogger('cache:synchro');
const { pubsub } = require('messages');
let cache = null;

const listenerMap = {};

const MESSAGES = {
  UNSET_ACCESS_LOGIC: 'unset-access-logic',
  UNSET_USER_DATA: 'unset-user-data',
  UNSET_USER: 'unset-user',
};

type Message = {
  action: string,
  userId: string,
  accessId?: string,
  accessToken?: string,
}

// ------- listener 

// listen for a userId
function trackChangesForUserId(userId: string): void {
  logger.debug('activate listener for user:', userId);
  if (listenerMap[userId] != null) return;
  listenerMap[userId] = pubsub.cache.onAndGetRemovable(
    userId,
    (msg) => { handleMessage(userId, msg); }
  );
}

// unregister listner
function removeChangeTracker(userId: string): void {
  logger.debug('disable listener for user:', userId);
  if (listenerMap[userId] == null) return;
  listenerMap[userId](); // remove listener
  delete listenerMap[userId];
}

// listener 
function handleMessage(userId: string, msg: Message) {
  logger.debug('handleMessage', userId, msg);
  if (msg.action === MESSAGES.UNSET_ACCESS_LOGIC) {
    return cache.unsetAccessLogic(userId, {id: msg.accessId, token: msg.accessToken}, false);
  }
  if (msg.action === MESSAGES.UNSET_USER_DATA) { // streams and accesses
    return cache.unsetUserData(userId, false);
  }
  if (msg.action === MESSAGES.UNSET_USER) {
    removeChangeTracker(userId);
    return cache.unsetUser(userId, false);
    //return cache.clearUserId(userId, msg.andAccountWithUsername, false);
  }
}

// ------- emitter 

function unsetAccessLogic(userId: string, accessLogic): void {
  pubsub.cache.emit(userId, {
    action: MESSAGES.UNSET_ACCESS_LOGIC,
    userId,
    accessId: accessLogic.id,
    accessToken: accessLogic.token
  });
}

function unsetUserData(userId: string): void {
  pubsub.cache.emit(userId, {
    action: MESSAGES.UNSET_USER_DATA,
    userId,
  });
}

function unsetUser(userId: string): void {
  pubsub.cache.emit(userId, {
    action: MESSAGES.UNSET_USER,
  });
}

// emit message "clear" to listeners
/**
 * 
 * @param {string} userId 
 * @param {string} [andAccountWithUsername] also clear account data cache if provided 
 */
/*function clearUserId(userId, andAccountWithUsername = null) {
  removeChangeTracker(userId);
  pubsub.cache.emit(userId, {action: 'clear', andAccountWithUsername: andAccountWithUsername});
}*/


// register cache here (to avoid require cycles)
function setCache(c) {
  cache = c;
}


module.exports = {
  trackChangesForUserId,
  unsetAccessLogic,
  unsetUserData,
  unsetUser,
  //clearUserId,
  setCache,
  listenerMap, // exported for tests only
  removeChangeTracker, // exported for tests only
  MESSAGES,
}