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
    this.options = options || {}; 
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
    logger.debug('forUser: ' + userid);
    this.checkInititalized();
    return this.userDBsCache.get(userid) || await open(this, userid);
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
    this.userDBsCache.del(userid);
    const dbPath = await dbPathForUserid(userid);
    try {
      unlinkSync(dbPath);
    } catch (err) {
      logger.debug('deleteUser: Error' + err);
    }
  }

  close() {
    this.checkInititalized();
    this.userDBsCache.reset();
  }
}

async function open(storage, userid) {
  logger.debug('open: ' + userid);
  const db = new UserDatabase({dbPath: await dbPathForUserid(userid)});
  storage.userDBsCache.set(userid, db);
  return db;
}


 /**
 * @param {string} uid -- user id (cuid format)
 */
async function dbPathForUserid(userid) {
  const userPath = await ensureUserDirectory(userid);
  return path.join(userPath, 'audit.sqlite');
}



module.exports = Storage;