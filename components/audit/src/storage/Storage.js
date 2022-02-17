/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const path = require('path');
const mkdirp = require('mkdirp').sync;
const unlinkSync = require('fs').unlinkSync;
const LRU = require('lru-cache');
const UserDatabase = require('./UserDatabase');
const { getConfig, getLogger } = require('@pryv/boiler');
const UserLocalDirectory = require('business').users.UserLocalDirectory;

const CACHE_SIZE = 500;

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
      dispose: function (key, db) { db.close(); }
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
    this.logger.info('deleteUser: ' + userid);
    const userDb = await this.forUser(userid);
    await userDb.close();
    this.userDBsCache.del(userid);
    const dbPath = await this._dbPathForUserid(this.id, userid);
    try {
      unlinkSync(dbPath);
    } catch (err) {
      this.logger.debug('deleteUser: Error' + err);
    }
  }

  close() {
    this.checkInititalized();
    this.userDBsCache.reset();
  }

  async _open(userid) {
    this.logger.debug('open: ' + userid);
    const db = new UserDatabase(this.logger, {dbPath: await this._dbPathForUserid(userid)});
    this.userDBsCache.set(userid, db);
    return db;
  }
  
  
   /**
   * @param {string} uid -- user id (cuid format)
   */
  async _dbPathForUserid(userid) {
    const userPath = await UserLocalDirectory.ensureUserDirectory(userid);
    return path.join(userPath, this.id + '.sqlite');
  }

}





module.exports = Storage;