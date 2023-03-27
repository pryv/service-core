/**
 * @license
 * Copyright (C) 2012–2023 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/**
 * Contains UserName >> UserId Mapping
 */

const mkdirp = require('mkdirp');
const SQLite3 = require('better-sqlite3');

const { getLogger, getConfig } = require('@pryv/boiler');
const cache = require('cache');

const logger = getLogger('users:local-index');

class UsersLocalIndex {
  initialized;
  /**
   * @type {DBIndex}
   */
  db;

  constructor () {
    this.initialized = false;
  }

  async init () {
    if (this.initialized) { return; }
    this.initialized = true;

    this.db = new DBIndex();
    await this.db.init();

    logger.debug('init');
  }

  /**
   * Check the integrity of the userIndex compared to the username events in SystemStreams
   * @returns {Object} With `errors` an array of error messages if discrepencies are found
   */
  async checkIntegrity () {
    const errors = [];
    const infos = {};
    const checkedMap = {};

    for (const collectionName of ['events', 'streams', 'accesses', 'profile', 'webhooks', 'followedSlices']) {
      const userIds = await getAllKnownUserIdsFromDB(collectionName);
      infos['userIdsCount-' + collectionName] = userIds.length;

      for (const userId of userIds) {
        if (checkedMap[userId]) continue;
        const username = this.getUsername(userId);
        checkedMap[userId] = true;
        if (username == null) {
          errors.push(`User id "${userId}" in mongo collection "${collectionName}" is unknown in the user index DB`);
          continue;
        }
      }
    }
    return {
      title: 'Users local index vs MongoDB',
      infos,
      errors
    };
  }

  async addUser (username, userId) {
    this.db.addUser(username, userId);
    logger.debug('addUser', username, userId);
  }

  async usernameExists (username) {
    const res = ((await this.getUserId(username)) != null);
    logger.debug('usernameExists', username, res);
    return res;
  }

  async getUserId (username) {
    let userId = cache.getUserId(username);
    if (userId == null) {
      userId = this.db.getIdForName(username);
      if (userId != null) {
        cache.setUserId(username, userId);
      }
    }
    logger.debug('idForName', username, userId);
    return userId;
  }

  async getUsername (userId) {
    const res = this.db.getNameForId(userId);
    logger.debug('nameForId', userId, res);
    return res;
  }

  /**
   * @returns {Promise<Object>} An object whose keys are the usernames and values are the user ids.
   */
  async getAllByUsername () {
    logger.debug('getAllByUsername');
    return this.db.getAllByUsername();
  }

  /**
   * Reset everything – used by tests only
   */
  async deleteAll () {
    logger.debug('deleteAll');
    cache.clear();
    return this.db.deleteAll();
  }

  async deleteById (userId) {
    logger.debug('deleteById', userId);
    return this.db.deleteById(userId);
  }
}

async function getAllKnownUserIdsFromDB (collectionName) {
  const { getDatabase } = require('storage'); // placed here to avoid some circular dependency
  const database = await getDatabase();
  const collection = await database.getCollection({ name: collectionName });
  const userIds = await collection.distinct('userId', {});
  return userIds;
}

class DBIndex {
  db;
  queryGetIdForName;
  queryGetNameForId;
  queryGetAll;
  queryInsert;
  queryDeleteAll;
  queryDeleteById;

  async init () {
    const config = await getConfig();
    const basePath = config.get('userFiles:path');
    mkdirp.sync(basePath);

    this.db = new SQLite3(basePath + '/user-index.db');
    this.db.pragma('journal_mode = WAL');

    this.db.prepare('CREATE TABLE IF NOT EXISTS id4name (username TEXT PRIMARY KEY, userId TEXT NOT NULL);').run();
    this.db.prepare('CREATE INDEX IF NOT EXISTS id4name_id ON id4name(userId);').run();

    this.queryGetIdForName = this.db.prepare('SELECT userId FROM id4name WHERE username = ?');
    this.queryGetNameForId = this.db.prepare('SELECT username FROM id4name WHERE userId = ?');
    this.queryInsert = this.db.prepare('INSERT INTO id4name (username, userId) VALUES (@username, @userId)');
    this.queryGetAll = this.db.prepare('SELECT username, userId FROM id4name');
    this.queryDeleteById = this.db.prepare('DELETE FROM id4name WHERE userId = @userId');
    this.queryDeleteAll = this.db.prepare('DELETE FROM id4name');
  }

  getIdForName (username) {
    return this.queryGetIdForName.get(username)?.userId;
  }

  getNameForId (userId) {
    return this.queryGetNameForId.get(userId)?.username;
  }

  addUser (username, userId) {
    return this.queryInsert.run({ username, userId });
  }

  deleteById (userId) {
    return this.queryDeleteById.run({ userId });
  }

  /**
   * @returns {Object} An object whose keys are the usernames and values are the user ids.
   */
  getAllByUsername () {
    const users = {};
    for (const user of this.queryGetAll.iterate()) {
      users[user.username] = user.userId;
    }
    return users;
  }

  deleteAll () {
    return this.queryDeleteAll.run();
  }
}

module.exports = new UsersLocalIndex();
