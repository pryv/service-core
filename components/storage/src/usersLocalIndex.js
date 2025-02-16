/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */
/**
 * Contains UserName >> UserId Mapping
 */

const { getConfig, getLogger } = require('@pryv/boiler');
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

    if ((await getConfig()).get('storageUserIndex:engine') === 'mongodb') {
      const DBIndex = require('./usersLocalIndexMongoDB');
      this.db = new DBIndex();
    } else {
      const DBIndex = require('./usersLocalIndexSQLite');
      this.db = new DBIndex();
    }

    await this.db.init();

    logger.debug('init');
  }

  /**
   * Check the integrity of the userIndex compared to the username events in SystemStreams
   * @returns {Promise<Object>} With `errors` an array of error messages if discrepencies are found
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
    await this.db.addUser(username, userId);
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
      userId = await this.db.getIdForName(username);
      if (userId != null) {
        cache.setUserId(username, userId);
      }
    }
    logger.debug('idForName', username, userId);
    return userId;
  }

  async getUsername (userId) {
    const res = await this.db.getNameForId(userId);
    logger.debug('nameForId', userId, res);
    return res;
  }

  /**
   * @returns {Promise<Object>} An object whose keys are the usernames and values are the user ids.
   */
  async getAllByUsername () {
    logger.debug('getAllByUsername');
    return await this.db.getAllByUsername();
  }

  /**
   * Reset everything – used by tests only
   */
  async deleteAll () {
    logger.debug('deleteAll');
    cache.clear();
    return await this.db.deleteAll();
  }

  async deleteById (userId) {
    logger.debug('deleteById', userId);
    return await this.db.deleteById(userId);
  }
}

async function getAllKnownUserIdsFromDB (collectionName) {
  const { getDatabase } = require('storage'); // placed here to avoid some circular dependency
  const database = await getDatabase();
  const collection = await database.getCollection({ name: collectionName });
  const userIds = await collection.distinct('userId', {});
  return userIds;
}

module.exports = new UsersLocalIndex();
