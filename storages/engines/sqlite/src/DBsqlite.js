/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

const mkdirp = require('mkdirp');
const SQLite3 = require('better-sqlite3');

const _internals = require('./_internals');
const logger = _internals.lazyLogger('platform:db');
const concurrentSafeWrite = require('./concurrentSafeWrite');

class DB {
  db;
  queries;

  async init () {
    const basePath = _internals.config.path;
    mkdirp.sync(basePath);

    this.db = new SQLite3(basePath + '/platform-wide.db');
    await concurrentSafeWrite.initWALAndConcurrentSafeWriteCapabilities(this.db);

    await concurrentSafeWrite.execute(() => {
      this.db.prepare('CREATE TABLE IF NOT EXISTS keyValue (key TEXT PRIMARY KEY, value TEXT NOT NULL);').run();
    });
    this.queries = {};
    this.queries.getValueWithKey = this.db.prepare('SELECT key, value FROM keyValue WHERE key = ?');
    this.queries.upsertUniqueKeyValue = this.db.prepare('INSERT OR REPLACE INTO keyValue (key, value) VALUES (@key, @value);');
    this.queries.deleteWithKey = this.db.prepare('DELETE FROM keyValue WHERE key = ?;');
    this.queries.deleteAll = this.db.prepare('DELETE FROM keyValue;');
    this.queries.getAllWithKeyStartsWith = this.db.prepare('SELECT key, value FROM keyValue WHERE key LIKE (? || \'%\')');
    this.queries.getAllWithValue = this.db.prepare('SELECT key, value FROM keyValue WHERE value = ?');
  }

  getOne (key) {
    const value = this.queries.getValueWithKey.all(key);
    const res = (value.length === 0) ? null : value[0].value;
    logger.debug('getOne', key, res);
    return res;
  }

  async getAllWithPrefix (prefix) {
    logger.debug('getAllWithPrefix', prefix);
    return this.queries.getAllWithKeyStartsWith.all(prefix).map(parseEntry);
  }

  getAllWithValue (value) {
    logger.debug('getAllWithValue', value);
    return this.queries.getAllWithKeyStartsWith.all(value).map(parseEntry);
  }

  /**
   * @param {string} key
   * @param {string} value
   * @returns
   */
  async set (key, value) {
    logger.debug('set', key, value);
    let result;
    await concurrentSafeWrite.execute(() => {
      result = this.queries.upsertUniqueKeyValue.run({ key, value });
    });
    return result;
  }

  /**
   * @param {string} key
   * @returns
   */
  async delete (key) {
    logger.debug('delete', key);
    let result;
    await concurrentSafeWrite.execute(() => {
      result = this.queries.deleteWithKey.run(key);
    });
    return result;
  }

  async deleteAll () {
    logger.debug('deleteAll');
    await concurrentSafeWrite.execute(() => {
      this.queries.deleteAll.run();
    });
  }

  // ----- utilities ------- //

  async setUserUniqueField (username, field, value) {
    const key = getUserUniqueKey(field, value);
    await this.set(key, username);
  }

  async setUserUniqueFieldIfNotExists (username, field, value) {
    const key = getUserUniqueKey(field, value);
    const existing = this.getOne(key);
    if (existing != null) {
      return existing === username; // true if same user, false if collision
    }
    await this.set(key, username);
    return true;
  }

  async deleteUserUniqueField (field, value) {
    const key = getUserUniqueKey(field, value);
    await this.delete(key);
  }

  async setUserIndexedField (username, field, value) {
    const key = getUserIndexedKey(username, field);
    await this.set(key, value);
  }

  async deleteUserIndexedField (username, field) {
    const key = getUserIndexedKey(username, field);
    await this.delete(key);
  }

  async getUserIndexedField (username, field) {
    const key = getUserIndexedKey(username, field);
    return this.getOne(key);
  }

  async getUsersUniqueField (field, value) {
    const key = getUserUniqueKey(field, value);
    return this.getOne(key);
  }

  async close () {
    this.db.close();
    this.db = null;
  }

  isClosed () {
    return this.db == null;
  }

  // --- Migration methods --- //

  async exportAll () {
    return await this.getAllWithPrefix('user');
  }

  async importAll (data) {
    for (const entry of data) {
      if (entry.isUnique) {
        await this.setUserUniqueField(entry.username, entry.field, entry.value);
      } else {
        await this.setUserIndexedField(entry.username, entry.field, entry.value);
      }
    }
  }

  async clearAll () {
    return await this.deleteAll();
  }

  // --- User-to-core mapping --- //

  async setUserCore (username, coreId) {
    const key = getUserCoreKey(username);
    await this.set(key, coreId);
  }

  async getUserCore (username) {
    const key = getUserCoreKey(username);
    return this.getOne(key);
  }

  async getAllUserCores () {
    const rows = this.queries.getAllWithKeyStartsWith.all('user-core/');
    return rows.map(row => ({
      username: row.key.slice('user-core/'.length),
      coreId: row.value
    }));
  }

  // --- Core registration --- //

  async setCoreInfo (coreId, info) {
    const key = 'core-info/' + coreId;
    await this.set(key, JSON.stringify(info));
  }

  async getCoreInfo (coreId) {
    const key = 'core-info/' + coreId;
    const val = this.getOne(key);
    return val != null ? JSON.parse(val) : null;
  }

  async getAllCoreInfos () {
    const rows = this.queries.getAllWithKeyStartsWith.all('core-info/');
    return rows.map(row => JSON.parse(row.value));
  }
}

/**
 * Return an object from an entry in the table
 * @param {Entry} entry
 * @param {string} entry.key
 * @param {string} entry.value
 */
function parseEntry (entry) {
  const [type, field, userNameOrValue] = entry.key.split('/');
  const isUnique = (type === 'user-unique');
  return {
    isUnique,
    field,
    username: isUnique ? entry.value : userNameOrValue,
    value: isUnique ? userNameOrValue : entry.value
  };
}

function getUserUniqueKey (field, value) {
  return 'user-unique/' + field + '/' + value;
}
function getUserIndexedKey (username, field) {
  return 'user-indexed/' + field + '/' + username;
}

function getUserCoreKey (username) {
  return 'user-core/' + username;
}

module.exports = DB;
