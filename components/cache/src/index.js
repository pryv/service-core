/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const { getLogger, getConfigUnsafe } = require('@pryv/boiler');
const _cache = {};

const logger = getLogger('cache');
const config = getConfigUnsafe(true);

function getNameSpace(namespace) {
  if (namespace == null) console.log('XXXX', new Error('Null namespace'));
  return _cache[namespace] || ( _cache[namespace] = {} );
}

function set(namespace, key, value) {
  if (key == null) throw new Error('Null key for' + namespace);
  if (config.get('caching:isActive') !== true) return;
  getNameSpace(namespace)[key] = value;
  logger.debug('set', namespace, key);
  return value;
}

function unset(namespace, key) {
  if (key == null) throw new Error('Null key for' + namespace);
  delete getNameSpace(namespace)[key];
  logger.debug('unset', namespace, key);
}

function get(namespace, key) {
  if (key == null) throw new Error('Null key for' + namespace);
  logger.debug('get', namespace, key);
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
}

const NS = {
  USERID_BY_USERNAME: 'userIdByUsername',
  LOCAL_STORE_STREAMS_BY_USERID: 'localStoreStreamsByUser',
  ACCESS_LOGIC_BY_USERIDTOKEN: 'access_Logic_BY_USERIDTOKEN',
  ACCESS_LOGIC_BY_USERIDACCESSID: 'access_Logic_BY_USERIDACCESSID',
}

module.exports = {
  set,
  unset,
  get,
  clear,
  NS 
}