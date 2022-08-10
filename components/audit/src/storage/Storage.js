/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const path = require('path');
const unlinkSync = require('fs').unlinkSync;
const LRU = require('lru-cache');
const UserDatabase = require('./UserDatabase');
const { getConfig, getLogger } = require('@pryv/boiler');
const logger = getLogger('audit:storage');
const ensureUserDirectory = require('business').users.UserLocalDirectory.ensureUserDirectory;

const CACHE_SIZE = 500;

class Storage {
  initialized = false;
  userDBsCache = null;
  options = null;

  async init() {
    if (this.initialized) {
      throw('Database already initalized');
    }
    this.config = await getConfig();
    logger.debug('Db initalized');
    this.initialized = true;
    return this;
  }

  constructor(options) {
    this.options = options || {};
    this.userDBsCache = new LRU({
      max: this.options.max || CACHE_SIZE,
      dispose: function (db, key) { db.close(); }
    });
  }

  /**
   * @throws if not initalized
   */
  checkInititalized() {
    if (! this.initialized) throw('Initialize db component before using it');
  }

  /**
   * get the database relative to a specific user
   * @param {string} userId
   * @returns {UserDatabase}
   */
  async forUser(userId) {
    logger.debug('forUser: ' + userId);
    this.checkInititalized();
    return this.userDBsCache.get(userId) || await open(this, userId);
  }

  /**
   * close and delete the database relative to a specific user
   * @param {string} userId
   * @returns {void}
   */
  async deleteUser(userId) {
    logger.info('deleteUser: ' + userId);
    const userDb = await this.forUser(userId);
    await userDb.close();
    this.userDBsCache.delete(userId);
    const dbPath = await dbPathForUserid(userId);
    try {
      unlinkSync(dbPath);
    } catch (err) {
      logger.debug('deleteUser: Error' + err);
    }
  }

  close() {
    this.checkInititalized();
    this.userDBsCache.clear();
  }
}

async function open(storage, userId) {
  logger.debug('open: ' + userId);
  const db = new UserDatabase({dbPath: await dbPathForUserid(userId)});
  storage.userDBsCache.set(userId, db);
  return db;
}


/**
 * @param {string} userId -- user id (cuid format)
 */
async function dbPathForUserid(userId) {
  const userPath = await ensureUserDirectory(userId);
  return path.join(userPath, 'audit.sqlite');
}



module.exports = Storage;
