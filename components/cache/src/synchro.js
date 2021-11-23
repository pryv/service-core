/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const { getLogger } = require('@pryv/boiler');
const logger = getLogger('cache:synchro');
const { pubsub } = require('messages');
let cache = null;

const listenerMap = {};


// ------- listener 

// listen for a userId
function trackChangesForUserId(userId) {
  logger.debug('activate changes for user:', userId);
  if (listenerMap[userId] != null) return;
  listenerMap[userId] = pubsub.cache.onAndGetRemovable(userId, (msg) => { handleMessage(userId, msg); });
}

// unregister listner
function removeChangeTracker(userId) {
  logger.debug('remove changes for user:', userId);
  if (listenerMap[userId] == null) return;
  listenerMap[userId](); // remove listener
  delete listenerMap[userId];
}

// listener 
function handleMessage(userId, msg) {
  logger.debug('handleMessage', userId, msg);
  if (msg.action == 'unset-access-logic') {
    return cache.unsetAccessLogic(userId, {id: msg.accessId, token: msg.accessToken}, false);
  }
  if (msg.action == 'clear') {
    removeChangeTracker(userId);
    return cache.clearUserId(userId, msg.andAccountWithUsername, false);
  }
}

// ------- emitter 

// emit message "unset" to listners
function unsetAccessLogic(userId, accessLogic) {
  pubsub.cache.emit(userId, {action: 'unset-access-logic', userId, accessId: accessLogic.id, accessToken: accessLogic.token});
}

// emit message "clear" to listners
/**
 * 
 * @param {string} userId 
 * @param {string} [andAccountWithUsername] also clear account data cache if provided 
 */
function clearUserId(userId, andAccountWithUsername = null) {
  removeChangeTracker(userId);
  pubsub.cache.emit(userId, {action: 'clear', andAccountWithUsername: andAccountWithUsername});
}


// register cache here (to avoid require cycles)
function setCache(c) {
  cache = c;
}


module.exports = {
  trackChangesForUserId,
  unsetAccessLogic,
  clearUserId,
  setCache,
  listenerMap, // exported for tests only
  removeChangeTracker, // exported for tests only
}