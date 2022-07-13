/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const mkdirp = require('mkdirp');
const sqlite3 = require('better-sqlite3');

const { getLogger, getConfig } = require('@pryv/boiler');
const logger = getLogger('platform:db');

class PlatformWideDB {
  db;
  queryUniqueKey;
  upsertUniqueKeyValue;
  deleteAll;

  constructor() { }

  async init() {
    const config = await getConfig();
    const basePath = config.get('userFiles:path');
    mkdirp.sync(basePath);

    const DB_OPTIONS = {};
    this.db = new sqlite3(basePath + '/platform-wide.db');
    this.db.pragma('journal_mode = WAL');

    this.db.prepare('CREATE TABLE IF NOT EXISTS uniqueKeys (key TEXT PRIMARY KEY, value TEXT NOT NULL);').run();


    // in the following query see the trick to pass a list of values as parameter
    this.queryUniqueKey = this.db.prepare('SELECT key, value FROM uniqueKeys WHERE key = ?');
    this.upsertUniqueKeyValue = this.db.prepare('INSERT OR REPLACE INTO uniqueKeys (key, value) VALUES (@key, @value);');
    this.deleteUniqueKey = this.db.prepare('DELETE FROM uniqueKeys WHERE key = ?;');
    this.deleteAll = this.db.prepare('DELETE FROM uniqueKeys;');
    this.queryAllStartsWith = this.db.prepare('SELECT key, value FROM uniqueKeys WHERE key LIKE (? || \'%\')');
    this.queryAllWithValue = this.db.prepare('SELECT key, value FROM uniqueKeys WHERE value = ?');
  }

  getOne(key) {
    const value = this.queryUniqueKey.all(key);
    const res = (value.length === 0) ? null : value[0].value;
    logger.debug('getOne', key, res);
    return res;
  }

  getAllWithPrefix(prefix) {
    return this.queryAllStartsWith.all(prefix).map(parseEntry);
  }

  getAllWithValue(value) {
    return this.queryAllStartsWith.all(value).map(parseEntry);
  }

  /**
   * 
   * @param {string} key
   * @param {string} value 
   * @returns 
   */
  set(key, value) {
    logger.debug('set', key, value);
    return this.upsertUniqueKeyValue.run({ key, value });
  }

  delete(key) {
    logger.debug('delete', key);
    return this.deleteUniqueKey.run(key);
  }

  reset() {
    logger.debug('reset');
    this.deleteAll.run();
  }

  // ----- utilities ------- //

  async setUserUniqueField(username, field, value) {
    const key = 'user-unique/' + field + '/' + value;
    this.set(key, username);
  }

  async deleteUserUniqueField(field, value) {
    const key = 'user-unique/' + field + '/' + value;
    this.delete(key);
  }

  async setUserIndexedField(username, field, value) {
    const key = 'user-indexed/' + field + '/' + username;
    this.set(key, value);
  }

  async deleteUserIndexedField(username, field) {
    const key = 'user-indexed/' + field + '/' + username;
    this.delete(key);
  }

  async getUserIndexedField(username, field) {
    const key = 'user-indexed/' + field + '/' + username;
    return this.getOne(key);
  }

  async getUsersUniqueField(field, value) {
    const key = 'user-unique/' + field + '/' + value;
    return this.getOne(key);
  }

  async close() {
    this.db.close();
  }
}

/**
 * Return an object from an entry in the table
 * @param {Entry} entry 
 * @param {string} entry.key 
 * @param {string} entry.value
 */
function parseEntry(entry) {
  const [type, field, userNameOrValue] = entry.key.split('/');
  const isUnique = (type == 'user-unique');
  return {
    isUnique: isUnique,
    field: field,
    username: isUnique ? entry.value : userNameOrValue,
    value: isUnique ? userNameOrValue : entry.value
  }
}

module.exports = PlatformWideDB;