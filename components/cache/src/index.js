/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const { getLogger, getConfigUnsafe } = require('@pryv/boiler');
const _cache = {};

let synchro = null;


const logger = getLogger('cache');
const debug = {};
for (const key of ['set', 'get', 'unset', 'clear']) {
  const logg = logger.getLogger(key);
  debug[key] = function() {
    logg.debug(...arguments);
  }
}

const config = getConfigUnsafe(true);

function getNameSpace(namespace) {
  if (namespace == null) console.log('XXXX', new Error('Null namespace'));
  return _cache[namespace] || ( _cache[namespace] = {} );
}

function set(namespace, key, value) {
  if (key == null) throw new Error('Null key for' + namespace);
  if (config.get('caching:isActive') !== true) return;
  getNameSpace(namespace)[key] = value;
  debug.set(namespace, key);
  return value;
}

function unset(namespace, key) {
  if (key == null) throw new Error('Null key for' + namespace);
  delete getNameSpace(namespace)[key];
  debug.unset(namespace, key);
}

function get(namespace, key) {
  if (key == null) throw new Error('Null key for' + namespace);
  debug.get(namespace, key);
  return getNameSpace(namespace)[key];
}

function clear(namespace) {
  if (namespace == null) { // clear all
    for (const ns of Object.keys(_cache)) {
      debug.clear(ns);
      delete _cache[ns];
    }
  } else {
    delete _cache[namespace];
  }
  debug.clear(namespace);
}

function setForUserId(userId, namespace, key, value) {
  if (synchro != null) synchro.trackChangesForUserId(userId);
  return set('user:' + userId, namespace + ':' + key, value);
}

function unsetForUserId(userId, namespace, key) {
  if (synchro != null) synchro.unsetForUserId(userId, namespace + ':' + key);
  return unset('user:' + userId, namespace + ':' + key);
}

function getForUserId(userId, namespace, key) {
  return get('user:' + userId, namespace + ':' + key)
}

function clearUserId(userId) {
  if (synchro != null) synchro.clearUserId(userId);
  clear('user:' + userId);
}

//--------------- Streams ---------------//
function getStreams(userId, key) {
  return getForUserId(userId, NS.STREAMS_FOR_USERID, key);
}

function setStreams(userId, key, streams) {
  setForUserId(userId, NS.STREAMS_FOR_USERID, key, streams);
}

function unsetStreams(userId, key) {
  unsetForUserId(userId, NS.STREAMS_FOR_USERID, key);
}


//--------------- Access Logic -----------//

function getAccessLogicForToken(userId, token) {
  return getForUserId(userId, NS.ACCESS_LOGIC_FOR_USERID_BY_TOKEN, token);
}

function getAccessLogicForId(userId, accessId) {
  return getForUserId(userId, NS.ACCESS_LOGIC_FOR_USERID_BY_ACCESSID, accessId);
}


function unsetAccessLogic(userId, accessLogic) {
  unsetForUserId(userId, NS.ACCESS_LOGIC_FOR_USERID_BY_TOKEN, accessLogic.token);
  unsetForUserId(userId, NS.ACCESS_LOGIC_FOR_USERID_BY_ACCESSID,  accessLogic.id);
}

function setAccessLogic(userId, accessLogic) {
  setForUserId(userId, NS.ACCESS_LOGIC_FOR_USERID_BY_TOKEN, accessLogic.token, accessLogic);
  setForUserId(userId, NS.ACCESS_LOGIC_FOR_USERID_BY_ACCESSID, accessLogic.id, accessLogic);
}

//---------------

const NS = {
  USERID_BY_USERNAME: 'USERID_BY_USERNAME',
  STREAMS_FOR_USERID: 'STREAMS',
  ACCESS_LOGIC_FOR_USERID_BY_TOKEN: 'ACCESS_LOGIC_BY_TOKEN',
  ACCESS_LOGIC_FOR_USERID_BY_ACCESSID: 'ACCESS_LOGIC_BY_ACCESSID',
}

const cache = {
  set,
  unset,
  get,
  clear,
  setForUserId,
  unsetForUserId,
  getForUserId,
  clearUserId,

  getAccessLogicForId,
  getAccessLogicForToken,
  unsetAccessLogic,
  setAccessLogic,

  setStreams,
  getStreams,
  unsetStreams,

  NS 
}

// load synchro if needed
if (! config.get('openSource:isActive')) {
  synchro = require('./synchro.js');
  synchro.setCache(cache);
}

module.exports = cache;
