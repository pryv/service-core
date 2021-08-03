/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const { getLogger, getConfigUnsafe } = require('@pryv/boiler');
const _cache = {};

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
    for (const ns of Object.values(NS)) {
      delete _cache[ns];
    }
  } else {
    delete _cache[namespace];
  }
  debug.get(namespace);
}

function setForUserId(userId, namespace, key, value) {
  return set('user:' + userId, namespace + ':' + key, value);
}

function unsetForUserId(userId, namespace, key) {
  return unset('user:' + userId, namespace + ':' + key);
}

function getForUserId(userId, namespace, key) {
  return get('user:' + userId, namespace + ':' + key)
}

function clearUserId(userId) {
  clear('user:' + userId);
}

const NS = {
  USERID_BY_USERNAME: 'userIdByUsername',
  STREAMS_FOR_USERID: 'localStoreStreamsByUser',
  ACCESS_LOGIC_FOR_USERID_BY_TOKEN: 'ACCESS_LOGIC_FOR_USERID_BY_TOKEN',
  ACCESS_LOGIC_FOR_USERID_BY_ACCESSIS: 'ACCESS_LOGIC_FOR_USERID_BY_ACCESSIS',
}

module.exports = {
  set,
  unset,
  get,
  clear,
  setForUserId,
  unsetForUserId,
  getForUserId,
  clearUserId,
  NS 
}