/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const path = require('path');
const mkdirp = require('mkdirp').sync;
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
  forUser(userid) {
    logger.debug('forUser: ' + userid);
    this.checkInititalized();
    return this.userDBsCache.get(userid) || open(this, userid);
  }

  close() {
    this.checkInititalized();
    this.userDBsCache.reset();
  }
}

function open(storage, userid) {
  logger.debug('open: ' + userid);
  const db = new UserDatabase({dbPath: dbPathForUserid(userid)});
  storage.userDBsCache.set(userid, db);
  return db;
}


 /**
 * @param {string} uid -- user id (cuid format)
 */
function dbPathForUserid(userid) {
  const userPath = ensureUserDirectory(userid);
  return path.join(userPath, 'audit.sqlite');
}



module.exports = Storage;