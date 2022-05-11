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
const UserLocalDirectory = require('business').users.UserLocalDirectory;

const versionning = require('./versioning');

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
    await UserLocalDirectory.init();
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
   * @param {string} userid
   * @returns {UserDatabase}
   */
  async forUser(userid) {
    this.logger.debug('forUser: ' + userid);
    this.checkInititalized();
    return this.userDBsCache.get(userid) || await this._open(userid);
  }

  /**
   * close and delete the database relative to a specific user
   * @param {string} userid
   * @returns {void}
   */
  async deleteUser(userid) {
    logger.info('deleteUser: ' + userid);
    const userDb = await this.forUser(userid);
    await userDb.close();
    this.userDBsCache.delete(userid);
    const dbPath = await dbPathForUserid(userid);
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

  async _open(userid) {
    this.logger.debug('open: ' + userid);

    const params = {
      dbPath: await this.dbPathForUserid(userid),
      version: VERSION,
    }

    const db = new UserDatabase(this.logger, params);
    await db.init();

    this.userDBsCache.set(userid, db);
    return db;
  }
  
  /**
   * Internal used for migrations
   * @param {string} uid -- user id (cuid format)
   */
   async dbPathForUserid(userid) {
    return await this._dbPathForUserid(userid, VERSION);
  }
  
  /**
   * @private
   * @param {string} uid -- user id (cuid format)
   * @param {string} versionString -- version of the database
   */
  async _dbPathForUserid(userid, versionString) {
    const userPath = await UserLocalDirectory.ensureUserDirectory(userid);
    return path.join(userPath, this.id + versionString + '.sqlite');
  }

}

module.exports = Storage;
