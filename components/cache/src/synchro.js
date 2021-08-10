/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const { pubsub } = require('messages');
let cache = null;

const removableListenersMap = {};


// ------- listener 

// listen for a userId
function trackChangesForUserId(userId) {
  if (removableListenersMap[userId] != null) return;
  removableListenersMap[userId] = pubsub.cache.onAndGetRemovable(userId, (msg) => { handleMessage(userId, msg); });
}

// unregister listner
function removeChangeTracker(userId) {
  if (removableListenersMap[userId] == null) return;
  removableListenersMap[userId](); // remove listener
  delete removableListenersMap[userId];
}

// listener 
function handleMessage(userId, msg) {
  if (msg.action == 'unset') {
    return cache.unset('user:' + userId, msg.key);
  }
  if (msg.action == 'clear') {
    removeChangeTracker(userId);
    return cache.clear('user:' + userId);
  }
}

// ------- emitter 

// emit message "unset" to listners
function unsetForUserId(userId, key) {
  pubsub.cache.emit(userId, {action: 'unset', key: key});
}

// emit message "clear" to listners
function clearUserId(userId) {
  removeChangeTracker(userId);
  pubsub.cache.emit(userId, {action: 'clear'});
}


// register cache here (to avoid require cycles)
function setCache(c) {
  cache = c;
}


module.exports = {
  trackChangesForUserId,
  unsetForUserId,
  clearUserId,
  setCache,
  removableListenersMap, // exported for tests only
  removeChangeTracker, // exported for tests only
}