/**
 * @license
 * Copyright (C) 2012–2024 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const mkdirp = require('mkdirp');
const SQLite3 = require('better-sqlite3');

const { getLogger, getConfig } = require('@pryv/boiler');
const logger = getLogger('platform:db');
const concurrentSafeWrite = require('storage/src/sqliteUtils/concurrentSafeWrite');

class DB {
  db;
  queries;

  async init () {
    const config = await getConfig();
    const basePath = config.get('userFiles:path');
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

  getAllWithPrefix (prefix) {
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

module.exports = DB;
