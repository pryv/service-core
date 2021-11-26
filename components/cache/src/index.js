/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

// @flow
const { getLogger, getConfigUnsafe } = require('@pryv/boiler');
const LRU = require('lru-cache');

const _caches = {};
const MAX_PER_CACHE_SIZE: number = 2000; // maximum elements for each cache (namespace)

let synchro = null;

let isActive: boolean = false;
let isSynchroActive: boolean = false

const logger = getLogger('cache');
const debug = {};
for (const key of ['set', 'get', 'unset', 'clear']) {
  const logg = logger.getLogger(key);
  debug[key] = function() {
    logg.debug(...arguments);
  }
}

const config = getConfigUnsafe(true);

/**
 * username -> userId
 */
const userIdForUsername: Map<string, string> = new Map();

function getNameSpace(namespace: string) {
  if (namespace == null) console.log('XXXX', new Error('Null namespace'));
  return _caches[namespace] || ( _caches[namespace] = new LRU(MAX_PER_CACHE_SIZE) ); // seting maxsize of 2000 to LRU cache
}

function set(namespace: string, key: string, value: string) {
  if (! isActive) return;  
  if (key == null) throw new Error('Null key for' + namespace);
  getNameSpace(namespace).set(key, value);
  debug.set(namespace, key);
  return value;
}

function unset(namespace: string, key: string) {
  if (! isActive) return;
  if (key == null) throw new Error('Null key for' + namespace);
  getNameSpace(namespace).del(key);
  debug.unset(namespace, key);
}

function get(namespace: string, key: string) {
  if (! isActive) return null;
  if (key == null) throw new Error('Null key for' + namespace);
  debug.get(namespace, key);
  return getNameSpace(namespace).get(key);
}

function clear(namespace: string) {
  if (namespace == null) { // clear all
    for (const ns of Object.keys(_caches)) {
      debug.clear(ns);
      delete _caches[ns];
    }
    debug.clear('userIdForUsername');
    userIdForUsername.clear();
  } else {
    delete _caches[namespace];
  }
  loadConfiguration(); // reload configuration
  debug.clear(namespace);
}

//--------------- Users ---------------//

function getUserId(username: string) {
  return userIdForUsername.get(username);
}

function setUserId(username: string, userId: string) {
  if (! isActive) return;
  userIdForUsername.set(username, userId);
}

function unsetUser(username: string, notifyOtherProcesses: boolean = true) {
  if (! isActive) return;
  const userId = getUserId(username);
  if (userId == null) return;
  
  unsetUserData(userId, false);
  // notify userId delete
  if (notifyOtherProcesses && isSynchroActive) synchro.unsetUserId(userId);
  userIdForUsername.delete(username);
}

function unsetUserData(userId: string, notifyOtherProcesses: boolean = true) {
  if (! isActive) return;
  // notify user data delete
  if (notifyOtherProcesses && isSynchroActive) synchro.unsetUserData(userId);
  _unsetStreams(userId, 'local'); // for now we hardcode local streams
  _clearAccessLogics(userId);
}

/**
 * Clear only all data related to userId 
 * @param {string} userId 
 * @param {[string]} andUserAccountWithUsername
 * @param {boolean} notifyOtherProcesses 
 * @returns 
 */
/*function clearUserId(userId, andUserAccountWithUsername = null, notifyOtherProcesses = true) {
  if (! isActive) return;
  if (notifyOtherProcesses && synchro != null) synchro.clearUserId(userId, andUserAccountWithUsername);
  _unsetStreams(userId, 'local'); // for now we hardcode local streams
  _clearAccessLogics(userId);
  if (andUserAccountWithUsername != null) {
    unset(NS.USERID_BY_USERNAME, andUserAccountWithUsername);
  }
}*/

//--------------- Streams ---------------//
function getStreams(userId, storeId = 'local') {
  return get(NS.STREAMS_FOR_USERID + storeId, userId);
}

function setStreams(userId, storeId = 'local', streams) {
  if (! isActive) return;
  if (isSynchroActive) synchro.trackChangesForUserId(userId); // follow this user
  set(NS.STREAMS_FOR_USERID + storeId, userId, streams);
}

function _unsetStreams(userId, storeId = 'local') {
  unset(NS.STREAMS_FOR_USERID + storeId, userId);
}

function unsetStreams(userId, storeId = 'local') { 
  // TODO remove?
  unsetUserData(userId);
  //clearUserId(userId); // for now we just fully clear this user.. 
}


//--------------- Access Logic -----------//

function getAccessLogicForToken(userId, token) {
  if (! isActive) return null;
  const accessLogics = get(NS.ACCESS_LOGICS_FOR_USERID, userId);
  if (accessLogics == null) return null;
  return accessLogics.tokens[token];
}

function getAccessLogicForId(userId, accessId) {
  if (! isActive) return null;
  const accessLogics = get(NS.ACCESS_LOGICS_FOR_USERID, userId);
  if (accessLogics == null) return null;
  return accessLogics.ids[accessId];
}


function unsetAccessLogic(userId, accessLogic, notifyOtherProcesses = true) {
  if (! isActive) return;
  // notify others to unsed
  if (notifyOtherProcesses && isSynchroActive) synchro.unsetAccessLogic(userId, accessLogic); // follow this user
  // perform unset
  const accessLogics = get(NS.ACCESS_LOGICS_FOR_USERID, userId);
  if (accessLogics == null) return ;
  delete accessLogics.tokens[accessLogic.token];
  delete accessLogics.ids[accessLogic.id];
}

function _clearAccessLogics(userId) {
  unset(NS.ACCESS_LOGICS_FOR_USERID, userId);
}

function setAccessLogic(userId, accessLogic) {
  if (! isActive) return;
  if (synchro != null) synchro.trackChangesForUserId(userId);
  let accessLogics = get(NS.ACCESS_LOGICS_FOR_USERID, userId);
  if (accessLogics == null) {
    accessLogics = {
      tokens: {},
      ids: {}
    }
    set(NS.ACCESS_LOGICS_FOR_USERID, userId, accessLogics);
  }
  accessLogics.tokens[accessLogic.token] = accessLogic;
  accessLogics.ids[accessLogic.id] = accessLogic;
}

//---------------

const NS = {
  USERID_BY_USERNAME: 'USERID_BY_USERNAME',
  STREAMS_FOR_USERID: 'STREAMS',
  ACCESS_LOGICS_FOR_USERID: 'ACCESS_LOGICS_BY_USERID'
}

const cache = {
  //set,
  //unset,
  //get,
  clear,

  getUserId,
  setUserId,
  unsetUser,
  unsetUserData,
  //clearUserId,

  getAccessLogicForId,
  getAccessLogicForToken,
  unsetAccessLogic,
  setAccessLogic,

  setStreams,
  getStreams,
  unsetStreams,

  loadConfiguration,
  isActive,

  NS
}

/** Used only from tests to reload configuration after settting changes */
function loadConfiguration() {
  // could be true/false or 1/0 if launched from command line
  isActive = config.get('caching:isActive') ? true : false;
  isSynchroActive = config.get('openSource:isActive') ? false : true;

  if (isSynchroActive) {
    synchro = require('./synchro.js');
    synchro.setCache(cache);
  }
}
loadConfiguration();

module.exports = cache;
