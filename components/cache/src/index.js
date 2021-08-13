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

function clearUserId(userId, doSync = true) {
  if (doSync && synchro != null) synchro.clearUserId(userId);
  _unsetStreams(userId, 'local'); // for now we hardcode local streams
  clearAccessLogics(userId);
}

//--------------- Streams ---------------//
function getStreams(userId, key) {
  return get(NS.STREAMS_FOR_USERID + key, userId);
}

function setStreams(userId, key, streams) {
  if (synchro != null) synchro.trackChangesForUserId(userId); // follow this user
  set(NS.STREAMS_FOR_USERID + key, userId, streams);
}

function _unsetStreams(userId, key) {
  unset(NS.STREAMS_FOR_USERID + key, userId);
}

function unsetStreams(userId, key) { 
  clearUserId(userId); // for now we just fully clear this user.. 
}


//--------------- Access Logic -----------//

function getAccessLogicForToken(userId, token) {
  const als = get(NS.ACCESS_LOGICS_FOR_USERID, userId);
  if (als == null) return null;
  return als.tokens[token];
}

function getAccessLogicForId(userId, accessId) {
  const als = get(NS.ACCESS_LOGICS_FOR_USERID, userId);
  if (als == null) return null;
  return als.ids[accessId];
}


function unsetAccessLogic(userId, accessLogic, doSync = true) {
  if (doSync && synchro != null) synchro.unsetAccessLogic(userId, accessLogic); // follow this user
  const als = get(NS.ACCESS_LOGICS_FOR_USERID, userId);
  if (als == null) return ;
  delete als.tokens[accessLogic.token];
  delete als.ids[accessLogic.id];
}

function clearAccessLogics(userId) {
  unset(NS.ACCESS_LOGICS_FOR_USERID, userId);
}

function setAccessLogic(userId, accessLogic) {
  if (synchro != null) synchro.trackChangesForUserId(userId);
  let als = get(NS.ACCESS_LOGICS_FOR_USERID, userId);
  if (als == null) {
    als = {
      tokens: {},
      ids: {}
    }
    set(NS.ACCESS_LOGICS_FOR_USERID, userId, als);
  }
  als.tokens[accessLogic.token] = accessLogic;
  als.ids[accessLogic.id] = accessLogic;
}

//---------------

const NS = {
  USERID_BY_USERNAME: 'USERID_BY_USERNAME',
  STREAMS_FOR_USERID: 'STREAMS',
  ACCESS_LOGICS_FOR_USERID: 'ACCESS_LOGICS_BY_USERID'
}

const cache = {
  set,
  unset,
  get,
  clear,

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
