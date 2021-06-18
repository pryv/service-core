/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const _cache = {};

function getNameSpace(namespace) {
  return _cache[namespace] || ( _cache[namespace] = {} );
}

function set(namespace, key, value) {
  getNameSpace(namespace)[key] = value;
  return value;
}

function unset(namespace, key) {
  delete getNameSpace(namespace)[key];
}

function get(namespace, key) {
  return getNameSpace(namespace)[key];
}

module.exports = {
  set,
  unset,
  get,
  NS: {
    USER_BY_ID: 'userById',
    USERID_BY_USERNAME: 'userIdByUsername',
    LOCAL_STORE_STREAMS_BY_USERID: 'localStoreStreamsByUser',
  }
}