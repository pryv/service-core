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


/**
 * userId -> listener
 */
const listenerMap: Map<string, string> = new Map();

const MESSAGES = {
  UNSET_ACCESS_LOGIC: 'unset-access-logic',
  UNSET_USER_DATA: 'unset-user-data',
  UNSET_USER: 'unset-user',
};

type Message = {
  action: string,
  username?: string,
  accessId?: string,
  accessToken?: string,
}

// ------- listener 

// listen for a userId
function registerListenerForUserId(userId: string): void {
  logger.debug('activate listener for user:', userId);
  if (listenerMap.has(userId)) return;
  listenerMap.set(userId, pubsub.cache.onAndGetRemovable(
    userId,
    (msg) => { handleMessage(userId, msg); }
  ));
}

// unregister listner
function removeListenerForUserId(userId: string): void {
  logger.debug('disable listener for user:', userId);
  if (! listenerMap.has(userId)) return;
  listenerMap.get(userId)(); // remove listener
  listenerMap.delete(userId);
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
    return cache.unsetUser(msg.username, false);
  }
}

// ------- emitter 

function unsetAccessLogic(userId: string, accessLogic): void {
  pubsub.cache.emit(userId, {
    action: MESSAGES.UNSET_ACCESS_LOGIC,
    accessId: accessLogic.id,
    accessToken: accessLogic.token
  });
}

function unsetUserData(userId: string): void {
  pubsub.cache.emit(userId, {
    action: MESSAGES.UNSET_USER_DATA,
  });
}

function unsetUser(username: string): void {
  pubsub.cache.emit(MESSAGES.UNSET_USER, {
    username: username,
  });
}

// register cache here (to avoid require cycles)
function setCache(c) {
  if (cache !== null) {
    return; //cache already set
  }
  cache = c;
  pubsub.cache.on(MESSAGES.UNSET_USER, function(msg) {
      cache.unsetUser(msg.username, false);
  });
}

module.exports = {
  registerListenerForUserId,
  unsetAccessLogic,
  unsetUserData,
  unsetUser,
  setCache,
  listenerMap, // exported for tests only
  removeListenerForUserId, // exported for tests only
  MESSAGES,
}