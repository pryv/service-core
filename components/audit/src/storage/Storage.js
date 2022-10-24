/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const path = require('path');
const unlinkSync = require('fs').unlinkSync;
const LRU = require('lru-cache');
const UserDatabase = require('./UserDatabase');
const { getConfig, getLogger } = require('@pryv/boiler');

const versionning = require('./versioning');
const logger = getLogger('audit:storage');
const userLocalDirectory = require('business').users.userLocalDirectory;
const ensureUserDirectory = userLocalDirectory.ensureUserDirectory;

const CACHE_SIZE = 500;
const VERSION = '1.0.0';
class Storage {
  initialized = false;
  userDBsCache = null;
  options = null;
  id = null;

  async init() {
    if (this.initialized) {
      throw('Database already initalized');
    }
    this.config = await getConfig();
    await userLocalDirectory.init();
    await versionning.checkAllUsers(this);
    this.logger.debug('Db initalized');
    this.initialized = true;
    return this;
  }

  constructor(id, options) { 
    this.id = id;
    this.logger = getLogger(this.id + ':storage');
    this.options = options || {}; 
    this.userDBsCache = new LRU({
      max: this.options.max || CACHE_SIZE,
      dispose: function (db, key) { db.close(); }
    });
  }

  getVersion() {
    return VERSION;
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
    this.logger.debug('forUser: ' + userId);
    this.checkInititalized();
    return this.userDBsCache.get(userId) || await open(this, userId, this.logger);
  }

  /**
   * close and delete the database relative to a specific user
   * @param {string} userId
   * @returns {void}
   */
  async deleteUser(userId) {
    this.logger.info('deleteUser: ' + userId);
    const userDb = await this.forUser(userId);
    await userDb.close();
    this.userDBsCache.delete(userId);
    const dbPath = await this.dbPathForUserid(userId);
    try {
      await unlinkFilePromise(dbPath);
    } catch (err) {
      this.logger.debug('deleteUser: Error' + err);
    }
  }

  close() {
    this.checkInititalized();
    this.userDBsCache.clear();
  }

  async dbPathForUserId(userId) {
    const userPath = await ensureUserDirectory(userId);
    return path.join(userPath, this.id + '-' + this.getVersion() + '.sqlite');
  }
}

async function open(storage, userId, logger) {
  logger.debug('open: ' + userId);
  const db = new UserDatabase(logger, {dbPath: await storage.dbPathForUserId(userId)});
  await db.init();
  storage.userDBsCache.set(userId, db);
  return db;
}

module.exports = Storage;
